# New web host preparation

Prepared host: `135.106.220.72`, Ubuntu 24.04, on 2026-10-06.
Both `deploy` and `root` access were verified with the existing Justina key.
No password was needed or stored.

Installed nginx and Certbot (official snap). nginx is enabled and active.
`affera.conf` is the HTTP baseline installed at
`/etc/nginx/sites-available/affera`, enabled through `sites-enabled/affera`.
It serves `/var/www/affera`, strips `/ru/` before proxying to port 4000 and
`/dxb/` before port 4001, and accepts requests up to 60 MiB for QC uploads.
Certbot will modify the server-side configuration when HTTPS is enabled.

Prepared deployment paths:

| Purpose | GitHub Environment secret | Value |
| --- | --- | --- |
| Backend checkout | `production-backend / APP_PATH` | `/home/deploy/analitika` |
| Dashboard files | `production-dashboard / DASHBOARD_PATH` | `/var/www/affera` |
| SSH host | `SSH_HOST` in both environments | `135.106.220.72` |
| SSH user | `SSH_USER` in both environments | `deploy` |

These are intended new-host settings; GitHub secrets were **not changed**.
Backend path is owned by deploy (0750); dashboard path is deploy:www-data
(0755). A temporary index page is present until the dashboard is deployed.
nginx configuration stays root-owned.

`/etc/sudoers.d/analitika-deploy` permits exactly:

```sudoers
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
```

The dashboard workflow uses these commands via `sudo -n`. The sudoers file
passed visudo validation; both commands succeeded as deploy without a password.
SSH and Nginx Full UFW rules were added; UFW remains inactive as found. HTTP
port 80 was verified reachable from the workstation.

## Remaining migration and HTTPS

On the preparation date, `affera.co.uk` A was `31.97.115.242` and AAAA was
`2a02:4780:f:3f44::1`; neither points to the new host. DNS, GitHub deployment
targets, current production, application containers and databases were not
changed by this preparation.

The new host returns HTTP 200 for the temporary site. RU and Dubai health
routes return 502 because the backend containers have not been deployed yet.
Restore existing databases/data and verify storage access before cutover;
Compose can initialize empty databases but does not migrate the old data.
Create a dedicated Actions SSH key and install its public key for deploy.

After the application/data are ready, point the domain's A record to the new
IP and either update AAAA to its new IPv6 or remove the old AAAA. Confirm DNS
and port 80 availability, then run as root (interactive email/account setup):

```bash
/snap/bin/certbot --nginx -d affera.co.uk --redirect
/snap/bin/certbot renew --dry-run
```

Certbot and its renewal timer are installed, but there is no certificate for
this domain on the new host yet. Verify the resulting HTTPS endpoints and
renewal after certificate issuance. DNS validation is an alternative if a
certificate is needed before directing traffic to the new host.

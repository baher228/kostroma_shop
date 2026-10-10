# Build pinned upstream releases: the former public container images are no
# longer available. Go verifies downloaded modules through its checksum database.
FROM golang:1.24.8-alpine AS build
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0
RUN go install -p 2 github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
RUN go install -p 2 github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /go/bin/mc /usr/local/bin/mc
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]

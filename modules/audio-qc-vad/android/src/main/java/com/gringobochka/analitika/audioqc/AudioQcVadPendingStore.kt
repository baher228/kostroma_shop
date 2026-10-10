package com.gringobochka.analitika.audioqc

import android.content.Context
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

object AudioQcVadPendingStore {
  private const val PREFS_NAME = "audio_qc_vad_pending_v1"
  private const val KEY_SEGMENTS = "segments"

  @Synchronized
  fun add(context: Context, segment: Bundle) {
    val items = readJson(context)
    val id = segment.getString("localRecordingId") ?: return
    val next = JSONArray()
    for (index in 0 until items.length()) {
      val current = items.getJSONObject(index)
      if (current.optString("localRecordingId") != id) next.put(current)
    }
    next.put(bundleToJson(segment))
    writeJson(context, next)
  }

  @Synchronized
  fun list(context: Context): List<Bundle> {
    val items = readJson(context)
    return (0 until items.length()).map { jsonToBundle(items.getJSONObject(it)) }
  }

  @Synchronized
  fun acknowledge(context: Context, localRecordingId: String) {
    val items = readJson(context)
    val next = JSONArray()
    for (index in 0 until items.length()) {
      val current = items.getJSONObject(index)
      if (current.optString("localRecordingId") != localRecordingId) next.put(current)
    }
    writeJson(context, next)
  }

  private fun readJson(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_SEGMENTS, "[]")
    return try {
      JSONArray(raw ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeJson(context: Context, value: JSONArray) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(KEY_SEGMENTS, value.toString()).apply()
  }

  private fun bundleToJson(bundle: Bundle): JSONObject = JSONObject().apply {
    bundle.keySet().forEach { key -> put(key, bundle.get(key) ?: JSONObject.NULL) }
  }

  private fun jsonToBundle(json: JSONObject): Bundle = Bundle().apply {
    json.keys().forEach { key ->
      when (val value = json.get(key)) {
        JSONObject.NULL -> putString(key, null)
        is Boolean -> putBoolean(key, value)
        is Int -> putInt(key, value)
        is Long -> putLong(key, value)
        is Number -> putDouble(key, value.toDouble())
        else -> putString(key, value.toString())
      }
    }
  }
}

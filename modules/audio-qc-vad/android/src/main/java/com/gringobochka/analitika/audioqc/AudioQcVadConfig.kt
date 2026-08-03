package com.gringobochka.analitika.audioqc

import android.content.Intent
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

data class AudioQcVadConfig(
  @Field val sampleRate: Int = 16000,
  @Field val channels: Int = 1,
  @Field val preRollSec: Double = 5.0,
  @Field val speechStartThresholdMs: Int = 700,
  @Field val silenceToStopSec: Double = 3.0,
  @Field val minSegmentDurationSec: Double = 5.0,
  @Field val maxSegmentDurationSec: Double = 300.0,
  @Field val uploadImmediately: Boolean = true,
  @Field val shopId: String = "",
  @Field val sellerId: String? = null,
  @Field val shiftId: String? = null,
  @Field val deviceId: String = "",
  @Field val appVersion: String = "unknown",
  @Field val timezone: String = "UTC"
) : Record {
  fun validated(): AudioQcVadConfig {
    require(sampleRate == 16000) { "sherpa-onnx Silero VAD requires sampleRate=16000." }
    require(channels == 1) { "AudioQcVad requires mono audio." }
    require(shopId.isNotBlank()) { "shopId is required." }
    require(deviceId.isNotBlank()) { "deviceId is required." }
    require(preRollSec in 0.0..30.0) { "preRollSec must be in range 0..30." }
    require(speechStartThresholdMs in 100..5000) { "speechStartThresholdMs must be in range 100..5000." }
    require(silenceToStopSec in 0.25..30.0) { "silenceToStopSec must be in range 0.25..30." }
    require(minSegmentDurationSec in 1.0..maxSegmentDurationSec) { "Invalid minSegmentDurationSec." }
    require(maxSegmentDurationSec in 5.0..1800.0) { "Invalid maxSegmentDurationSec." }
    return this
  }

  fun putInto(intent: Intent) {
    intent.putExtra(EXTRA_SAMPLE_RATE, sampleRate)
    intent.putExtra(EXTRA_CHANNELS, channels)
    intent.putExtra(EXTRA_PRE_ROLL_SEC, preRollSec)
    intent.putExtra(EXTRA_SPEECH_START_THRESHOLD_MS, speechStartThresholdMs)
    intent.putExtra(EXTRA_SILENCE_TO_STOP_SEC, silenceToStopSec)
    intent.putExtra(EXTRA_MIN_SEGMENT_DURATION_SEC, minSegmentDurationSec)
    intent.putExtra(EXTRA_MAX_SEGMENT_DURATION_SEC, maxSegmentDurationSec)
    intent.putExtra(EXTRA_UPLOAD_IMMEDIATELY, uploadImmediately)
    intent.putExtra(EXTRA_SHOP_ID, shopId)
    intent.putExtra(EXTRA_SELLER_ID, sellerId)
    intent.putExtra(EXTRA_SHIFT_ID, shiftId)
    intent.putExtra(EXTRA_DEVICE_ID, deviceId)
    intent.putExtra(EXTRA_APP_VERSION, appVersion)
    intent.putExtra(EXTRA_TIMEZONE, timezone)
  }

  companion object {
    private const val EXTRA_SAMPLE_RATE = "audioQcVad.sampleRate"
    private const val EXTRA_CHANNELS = "audioQcVad.channels"
    private const val EXTRA_PRE_ROLL_SEC = "audioQcVad.preRollSec"
    private const val EXTRA_SPEECH_START_THRESHOLD_MS = "audioQcVad.speechStartThresholdMs"
    private const val EXTRA_SILENCE_TO_STOP_SEC = "audioQcVad.silenceToStopSec"
    private const val EXTRA_MIN_SEGMENT_DURATION_SEC = "audioQcVad.minSegmentDurationSec"
    private const val EXTRA_MAX_SEGMENT_DURATION_SEC = "audioQcVad.maxSegmentDurationSec"
    private const val EXTRA_UPLOAD_IMMEDIATELY = "audioQcVad.uploadImmediately"
    private const val EXTRA_SHOP_ID = "audioQcVad.shopId"
    private const val EXTRA_SELLER_ID = "audioQcVad.sellerId"
    private const val EXTRA_SHIFT_ID = "audioQcVad.shiftId"
    private const val EXTRA_DEVICE_ID = "audioQcVad.deviceId"
    private const val EXTRA_APP_VERSION = "audioQcVad.appVersion"
    private const val EXTRA_TIMEZONE = "audioQcVad.timezone"

    fun from(intent: Intent): AudioQcVadConfig = AudioQcVadConfig(
      sampleRate = intent.getIntExtra(EXTRA_SAMPLE_RATE, 16000),
      channels = intent.getIntExtra(EXTRA_CHANNELS, 1),
      preRollSec = intent.getDoubleExtra(EXTRA_PRE_ROLL_SEC, 5.0),
      speechStartThresholdMs = intent.getIntExtra(EXTRA_SPEECH_START_THRESHOLD_MS, 700),
      silenceToStopSec = intent.getDoubleExtra(EXTRA_SILENCE_TO_STOP_SEC, 3.0),
      minSegmentDurationSec = intent.getDoubleExtra(EXTRA_MIN_SEGMENT_DURATION_SEC, 5.0),
      maxSegmentDurationSec = intent.getDoubleExtra(EXTRA_MAX_SEGMENT_DURATION_SEC, 300.0),
      uploadImmediately = intent.getBooleanExtra(EXTRA_UPLOAD_IMMEDIATELY, true),
      shopId = intent.getStringExtra(EXTRA_SHOP_ID).orEmpty(),
      sellerId = intent.getStringExtra(EXTRA_SELLER_ID),
      shiftId = intent.getStringExtra(EXTRA_SHIFT_ID),
      deviceId = intent.getStringExtra(EXTRA_DEVICE_ID).orEmpty(),
      appVersion = intent.getStringExtra(EXTRA_APP_VERSION) ?: "unknown",
      timezone = intent.getStringExtra(EXTRA_TIMEZONE) ?: "UTC"
    ).validated()
  }
}

package com.gringobochka.analitika.audioqc

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Process
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.concurrent.thread
import kotlin.math.max

class AudioQcVadService : Service(), VadStateMachineListener {
  @Volatile private var capturing = false
  private var captureThread: Thread? = null
  private var audioRecord: AudioRecord? = null
  private var engine: SherpaVadEngine? = null
  private var stateMachine: VadStateMachine? = null
  private var segmentWriter: SegmentWriter? = null
  private var segmentId: String? = null
  private var segmentStartedAtMs = 0L
  private lateinit var config: AudioQcVadConfig
  private var lastProbabilityLogAt = 0L
  private var lastDurationEventAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      config = AudioQcVadConfig.from(intent ?: throw IllegalArgumentException("Missing VAD config."))
      startForegroundNotification()
      restartCapture()
    } catch (error: Throwable) {
      fail(error)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopCapture()
    AudioQcVadRuntime.update(
      active = false,
      modelLoaded = false,
      state = "inactive",
      currentSegmentDurationSec = 0.0
    )
    Log.i(TAG, "VAD service stopped")
    super.onDestroy()
  }

  private fun restartCapture() {
    stopCapture()
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("RECORD_AUDIO permission is not granted.")
    }

    capturing = true
    AudioQcVadRuntime.update(
      active = true,
      modelLoaded = false,
      state = "loading_model",
      currentSegmentDurationSec = 0.0,
      lastError = null
    )
    captureThread = thread(name = "AudioQcVadCapture", start = true) { captureLoop() }
  }

  private fun captureLoop() {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
    var shouldStopService = false
    try {
      val nextEngine = SherpaVadEngine(this, config.sampleRate)
      engine = nextEngine
      val machine = VadStateMachine(
        sampleRate = config.sampleRate,
        frameSize = SherpaVadEngine.FRAME_SIZE,
        preRollSec = config.preRollSec,
        speechStartThresholdMs = config.speechStartThresholdMs,
        silenceToStopSec = config.silenceToStopSec,
        maxSegmentDurationSec = config.maxSegmentDurationSec,
        listener = this
      )
      stateMachine = machine
      val recorder = createAudioRecord()
      audioRecord = recorder
      recorder.startRecording()
      AudioQcVadRuntime.update(active = true, modelLoaded = true, state = "idle", lastError = null)
      Log.i(TAG, "VAD service started; sampleRate=${config.sampleRate}")

      val frame = ShortArray(SherpaVadEngine.FRAME_SIZE)
      while (capturing) {
        var offset = 0
        while (capturing && offset < frame.size) {
          val read = recorder.read(frame, offset, frame.size - offset, AudioRecord.READ_BLOCKING)
          if (read < 0) throw IllegalStateException("AudioRecord read failed: $read")
          offset += read
        }
        if (!capturing || offset != frame.size) break

        val probability = nextEngine.probability(frame)
        val speech = nextEngine.isSpeech(probability)
        val now = System.currentTimeMillis()
        if (now - lastProbabilityLogAt >= 1000) {
          Log.d(TAG, "speechProbability=${"%.3f".format(Locale.US, probability)} decision=$speech")
          lastProbabilityLogAt = now
        }
        machine.process(frame, speech)
        if (now - lastDurationEventAt >= 500 &&
          (machine.state() == VadProcessingState.RECORDING || machine.state() == VadProcessingState.POSSIBLE_END)
        ) {
          AudioQcVadRuntime.update(
            state = machine.state().wireName,
            currentSegmentDurationSec = machine.currentSegmentDurationSec()
          )
          lastDurationEventAt = now
        }
      }
      machine.stopAndFinalize()
    } catch (error: Throwable) {
      if (capturing) {
        fail(error)
        shouldStopService = true
      }
    } finally {
      capturing = false
      runCatching { stateMachine?.stopAndFinalize() }
      runCatching { audioRecord?.stop() }
      runCatching { audioRecord?.release() }
      audioRecord = null
      runCatching { engine?.close() }
      engine = null
      stateMachine = null
      segmentWriter?.abort()
      segmentWriter = null
      segmentId = null
      if (shouldStopService) stopSelf()
    }
  }

  private fun createAudioRecord(): AudioRecord {
    val channel = AudioFormat.CHANNEL_IN_MONO
    val encoding = AudioFormat.ENCODING_PCM_16BIT
    val minBufferBytes = AudioRecord.getMinBufferSize(config.sampleRate, channel, encoding)
    require(minBufferBytes > 0) { "AudioRecord does not support 16 kHz mono PCM." }
    val bufferBytes = max(minBufferBytes * 2, SherpaVadEngine.FRAME_SIZE * 2 * 4)
    return AudioRecord.Builder()
      .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(config.sampleRate)
          .setChannelMask(channel)
          .setEncoding(encoding)
          .build()
      )
      .setBufferSizeInBytes(bufferBytes)
      .build()
      .also { require(it.state == AudioRecord.STATE_INITIALIZED) { "Unable to initialize AudioRecord." } }
  }

  private fun stopCapture() {
    capturing = false
    runCatching { audioRecord?.stop() }
    val worker = captureThread
    if (worker != null && worker !== Thread.currentThread()) runCatching { worker.join(2500) }
    captureThread = null
  }

  override fun onStateChanged(from: VadProcessingState, to: VadProcessingState, segmentDurationSec: Double) {
    Log.i(TAG, "state transition: ${from.name} -> ${to.name}")
    AudioQcVadRuntime.update(state = to.wireName, currentSegmentDurationSec = segmentDurationSec)
  }

  override fun onSegmentStarted(preRoll: List<VadAudioFrame>) {
    val id = "aqc_vad_${System.currentTimeMillis().toString(36)}_${UUID.randomUUID().toString().take(8)}"
    val directory = File(filesDir, AUDIO_DIRECTORY)
    val writer = SegmentWriter(directory, id, config.sampleRate)
    preRoll.forEach { writer.append(it.samples) }
    segmentId = id
    segmentWriter = writer
    val preRollSamples = preRoll.sumOf { it.samples.size }
    segmentStartedAtMs = System.currentTimeMillis() - (preRollSamples * 1000L / config.sampleRate)
    Log.i(TAG, "segment started: id=$id preRollFrames=${preRoll.size}")
  }

  override fun onSegmentFrame(frame: VadAudioFrame) {
    segmentWriter?.append(frame.samples)
  }

  override fun onSegmentFinalized(durationSec: Double, speechRatio: Double, forced: Boolean) {
    val writer = segmentWriter ?: return
    val id = segmentId ?: return
    segmentWriter = null
    segmentId = null
    val endedAtMs = System.currentTimeMillis()
    val result = writer.finalizeFile(config.minSegmentDurationSec)
    engine?.reset()
    if (result == null) {
      Log.i(TAG, "segment discarded: id=$id durationSec=$durationSec minimum=${config.minSegmentDurationSec}")
      return
    }

    val endedAt = isoTimestamp(endedAtMs)
    val payload = Bundle().apply {
      putString("localRecordingId", id)
      putString("fileUri", Uri.fromFile(result.file).toString())
      putString("shopId", config.shopId)
      putString("sellerId", config.sellerId)
      putString("shiftId", config.shiftId)
      putString("deviceId", config.deviceId)
      putString("appVersion", config.appVersion)
      putString("timezone", config.timezone)
      putBoolean("uploadImmediately", config.uploadImmediately)
      putString("startedAt", isoTimestamp(segmentStartedAtMs))
      putString("endedAt", endedAt)
      putDouble("durationSec", result.durationSec)
      putLong("fileSizeBytes", result.fileSizeBytes)
      putDouble("preRollSec", config.preRollSec)
      putDouble("silenceToStopSec", config.silenceToStopSec)
      putInt("speechStartThresholdMs", config.speechStartThresholdMs)
      putDouble("maxSegmentDurationSec", config.maxSegmentDurationSec)
      putDouble("speechRatio", speechRatio)
      putString("vadEngine", "sherpa-onnx-silero")
    }
    AudioQcVadPendingStore.add(this, payload)
    AudioQcVadRuntime.update(lastSegmentAt = endedAt, currentSegmentDurationSec = 0.0)
    AudioQcVadRuntime.emitSegment(payload)
    Log.i(
      TAG,
      "segment finalized: fileUri=${payload.getString("fileUri")} durationSec=${result.durationSec} " +
        "size=${result.fileSizeBytes} speechRatio=$speechRatio forced=$forced"
    )
  }

  private fun fail(error: Throwable) {
    val message = error.message ?: error.javaClass.simpleName
    Log.e(TAG, "VAD error: $message", error)
    AudioQcVadRuntime.emitError(message)
  }

  private fun startForegroundNotification() {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Analitika: VAD активен")
      .setContentText("Микрофон используется для выделения речевых сегментов")
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(contentIntent)
      .build()
    val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Audio QC VAD",
        NotificationManager.IMPORTANCE_LOW
      ).apply { description = "Индикатор автоматического выделения речевых сегментов" }
    )
  }

  companion object {
    const val ACTION_START = "com.gringobochka.analitika.audioqc.START"
    const val ACTION_STOP = "com.gringobochka.analitika.audioqc.STOP"
    private const val AUDIO_DIRECTORY = "audio-qc"
    private const val NOTIFICATION_CHANNEL_ID = "audio_qc_vad"
    private const val NOTIFICATION_ID = 6402
    private const val TAG = "AudioQcVad"

    private fun isoTimestamp(epochMs: Long): String =
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }.format(Date(epochMs))
  }
}

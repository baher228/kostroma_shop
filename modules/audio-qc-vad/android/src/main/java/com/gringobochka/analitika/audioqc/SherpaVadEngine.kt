package com.gringobochka.analitika.audioqc

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig

class SherpaVadEngine(
  context: Context,
  sampleRate: Int,
  private val threshold: Float = 0.5f
) : AutoCloseable {
  private val vad: Vad

  init {
    val config = VadModelConfig(
      sileroVadModelConfig = SileroVadModelConfig(
        model = "models/silero_vad.onnx",
        threshold = threshold,
        minSilenceDuration = 0.25f,
        minSpeechDuration = 0.25f,
        windowSize = FRAME_SIZE,
        maxSpeechDuration = 1800.0f
      ),
      sampleRate = sampleRate,
      numThreads = 1,
      provider = "cpu",
      debug = false
    )
    vad = Vad(assetManager = context.assets, config = config)
    Log.i(TAG, "sherpa-onnx Silero model loaded; sampleRate=$sampleRate frameSize=$FRAME_SIZE")
  }

  fun probability(samples: ShortArray): Float {
    require(samples.size == FRAME_SIZE) { "Expected $FRAME_SIZE samples, got ${samples.size}." }
    val normalized = FloatArray(samples.size) { index -> samples[index] / 32768.0f }
    return vad.compute(normalized).coerceIn(0.0f, 1.0f)
  }

  fun isSpeech(probability: Float): Boolean = probability >= threshold

  fun reset() = vad.reset()

  override fun close() = vad.release()

  companion object {
    const val FRAME_SIZE = 512
    private const val TAG = "AudioQcVad"
  }
}

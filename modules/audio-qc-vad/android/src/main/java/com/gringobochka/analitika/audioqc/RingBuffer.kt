package com.gringobochka.analitika.audioqc

import java.util.ArrayDeque
import kotlin.math.ceil

data class VadAudioFrame(
  val samples: ShortArray,
  val speech: Boolean
)

class RingBuffer(
  sampleRate: Int,
  frameSize: Int,
  preRollSec: Double
) {
  private val maxFrames = ceil(preRollSec * sampleRate / frameSize).toInt().coerceAtLeast(0)
  private val frames = ArrayDeque<VadAudioFrame>()

  fun add(samples: ShortArray, speech: Boolean) {
    if (maxFrames == 0) return
    frames.addLast(VadAudioFrame(samples.copyOf(), speech))
    while (frames.size > maxFrames) frames.removeFirst()
  }

  fun snapshot(): List<VadAudioFrame> = frames.map { VadAudioFrame(it.samples.copyOf(), it.speech) }

  fun clear() = frames.clear()

  fun size(): Int = frames.size
}

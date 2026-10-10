package com.gringobochka.analitika.audioqc

enum class VadProcessingState(val wireName: String) {
  IDLE("idle"),
  POSSIBLE_SPEECH("possible_speech"),
  RECORDING("recording"),
  POSSIBLE_END("possible_end"),
  FINALIZING("finalizing")
}

interface VadStateMachineListener {
  fun onStateChanged(from: VadProcessingState, to: VadProcessingState, segmentDurationSec: Double)
  fun onSegmentStarted(preRoll: List<VadAudioFrame>)
  fun onSegmentFrame(frame: VadAudioFrame)
  fun onSegmentFinalized(durationSec: Double, speechRatio: Double, forced: Boolean)
}

class VadStateMachine(
  private val sampleRate: Int,
  frameSize: Int,
  preRollSec: Double,
  private val speechStartThresholdMs: Int,
  private val silenceToStopSec: Double,
  private val maxSegmentDurationSec: Double,
  private val listener: VadStateMachineListener
) {
  private val ringBuffer = RingBuffer(sampleRate, frameSize, preRollSec)
  private var state = VadProcessingState.IDLE
  private var speechRunMs = 0.0
  private var silenceRunMs = 0.0
  private var segmentSamples = 0L
  private var speechSamples = 0L

  fun state(): VadProcessingState = state

  fun currentSegmentDurationSec(): Double = segmentSamples.toDouble() / sampleRate

  fun process(samples: ShortArray, speech: Boolean) {
    if (samples.isEmpty()) return
    val frameMs = samples.size * 1000.0 / sampleRate
    val frame = VadAudioFrame(samples.copyOf(), speech)

    when (state) {
      VadProcessingState.IDLE -> {
        ringBuffer.add(samples, speech)
        if (speech) {
          speechRunMs = frameMs
          transition(VadProcessingState.POSSIBLE_SPEECH)
          maybeStartRecording()
        }
      }

      VadProcessingState.POSSIBLE_SPEECH -> {
        ringBuffer.add(samples, speech)
        if (speech) {
          speechRunMs += frameMs
          maybeStartRecording()
        } else {
          speechRunMs = 0.0
          transition(VadProcessingState.IDLE)
        }
      }

      VadProcessingState.RECORDING -> {
        ringBuffer.add(samples, speech)
        append(frame)
        if (!speech) {
          silenceRunMs = frameMs
          transition(VadProcessingState.POSSIBLE_END)
        }
        maybeForceFinalize()
      }

      VadProcessingState.POSSIBLE_END -> {
        ringBuffer.add(samples, speech)
        append(frame)
        if (speech) {
          silenceRunMs = 0.0
          transition(VadProcessingState.RECORDING)
        } else {
          silenceRunMs += frameMs
          if (silenceRunMs >= silenceToStopSec * 1000.0) finalizeSegment(forced = false)
        }
        maybeForceFinalize()
      }

      VadProcessingState.FINALIZING -> Unit
    }
  }

  fun stopAndFinalize() {
    when (state) {
      VadProcessingState.RECORDING, VadProcessingState.POSSIBLE_END -> finalizeSegment(forced = true)
      else -> {
        speechRunMs = 0.0
        silenceRunMs = 0.0
        ringBuffer.clear()
        if (state != VadProcessingState.IDLE) transition(VadProcessingState.IDLE)
      }
    }
  }

  private fun maybeStartRecording() {
    if (state != VadProcessingState.POSSIBLE_SPEECH || speechRunMs < speechStartThresholdMs) return
    val preRoll = ringBuffer.snapshot()
    segmentSamples = preRoll.sumOf { it.samples.size }.toLong()
    speechSamples = preRoll.filter { it.speech }.sumOf { it.samples.size }.toLong()
    silenceRunMs = 0.0
    listener.onSegmentStarted(preRoll)
    transition(VadProcessingState.RECORDING)
    maybeForceFinalize()
  }

  private fun append(frame: VadAudioFrame) {
    listener.onSegmentFrame(frame)
    segmentSamples += frame.samples.size
    if (frame.speech) speechSamples += frame.samples.size
  }

  private fun maybeForceFinalize() {
    if ((state == VadProcessingState.RECORDING || state == VadProcessingState.POSSIBLE_END) &&
      currentSegmentDurationSec() >= maxSegmentDurationSec
    ) {
      finalizeSegment(forced = true)
    }
  }

  private fun finalizeSegment(forced: Boolean) {
    if (state != VadProcessingState.RECORDING && state != VadProcessingState.POSSIBLE_END) return
    transition(VadProcessingState.FINALIZING)
    val durationSec = currentSegmentDurationSec()
    val speechRatio = if (segmentSamples > 0) speechSamples.toDouble() / segmentSamples else 0.0
    listener.onSegmentFinalized(durationSec, speechRatio.coerceIn(0.0, 1.0), forced)
    segmentSamples = 0
    speechSamples = 0
    speechRunMs = 0.0
    silenceRunMs = 0.0
    if (forced) ringBuffer.clear()
    transition(VadProcessingState.IDLE)
  }

  private fun transition(next: VadProcessingState) {
    if (state == next) return
    val previous = state
    state = next
    listener.onStateChanged(previous, next, currentSegmentDurationSec())
  }
}

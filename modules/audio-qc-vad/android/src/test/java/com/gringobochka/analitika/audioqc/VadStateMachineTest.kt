package com.gringobochka.analitika.audioqc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VadStateMachineTest {
  private class Listener : VadStateMachineListener {
    var starts = 0
    var frames = 0
    var finalizes = 0
    var finalizedDuration = 0.0
    var speechRatio = 0.0
    val states = mutableListOf<VadProcessingState>()

    override fun onStateChanged(from: VadProcessingState, to: VadProcessingState, segmentDurationSec: Double) {
      states.add(to)
    }

    override fun onSegmentStarted(preRoll: List<VadAudioFrame>) {
      starts += 1
      frames += preRoll.size
    }

    override fun onSegmentFrame(frame: VadAudioFrame) {
      frames += 1
    }

    override fun onSegmentFinalized(durationSec: Double, speechRatio: Double, forced: Boolean) {
      finalizes += 1
      finalizedDuration = durationSec
      this.speechRatio = speechRatio
    }
  }

  @Test
  fun `single noisy frame never starts a segment`() {
    val listener = Listener()
    val machine = machine(listener)
    machine.process(frame(), true)
    machine.process(frame(), false)

    assertEquals(0, listener.starts)
    assertEquals(VadProcessingState.IDLE, machine.state())
  }

  @Test
  fun `sustained speech starts and sustained silence finalizes`() {
    val listener = Listener()
    val machine = machine(listener)
    repeat(4) { machine.process(frame(), true) }
    repeat(4) { machine.process(frame(), false) }

    assertEquals(1, listener.starts)
    assertEquals(1, listener.finalizes)
    assertEquals(VadProcessingState.IDLE, machine.state())
    assertTrue(listener.finalizedDuration >= 0.6)
    assertTrue(listener.speechRatio in 0.0..1.0)
  }

  @Test
  fun `maximum duration forces finalization`() {
    val listener = Listener()
    val machine = machine(listener, maxDurationSec = 0.6)
    repeat(8) { machine.process(frame(), true) }

    assertEquals(1, listener.finalizes)
    assertEquals(VadProcessingState.IDLE, machine.state())
  }

  private fun machine(listener: Listener, maxDurationSec: Double = 10.0) = VadStateMachine(
    sampleRate = 16000,
    frameSize = 1600,
    preRollSec = 0.2,
    speechStartThresholdMs = 300,
    silenceToStopSec = 0.3,
    maxSegmentDurationSec = maxDurationSec,
    listener = listener
  )

  private fun frame() = ShortArray(1600) { 100 }
}

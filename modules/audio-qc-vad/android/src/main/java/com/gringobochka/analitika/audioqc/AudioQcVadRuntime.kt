package com.gringobochka.analitika.audioqc

import android.os.Bundle

object AudioQcVadRuntime {
  const val EVENT_SEGMENT_FINALIZED = "AudioQcVadSegmentFinalized"
  const val EVENT_STATE_CHANGED = "AudioQcVadStateChanged"
  const val EVENT_ERROR = "AudioQcVadError"

  @Volatile
  var eventListener: ((String, Bundle) -> Unit)? = null

  private var available = true
  private var active = false
  private var modelLoaded = false
  private var state = "inactive"
  private var currentSegmentDurationSec = 0.0
  private var lastSegmentAt: String? = null
  private var lastError: String? = null

  @Synchronized
  fun update(
    active: Boolean = this.active,
    modelLoaded: Boolean = this.modelLoaded,
    state: String = this.state,
    currentSegmentDurationSec: Double = this.currentSegmentDurationSec,
    lastSegmentAt: String? = this.lastSegmentAt,
    lastError: String? = this.lastError,
    emit: Boolean = true
  ) {
    this.active = active
    this.modelLoaded = modelLoaded
    this.state = state
    this.currentSegmentDurationSec = currentSegmentDurationSec
    this.lastSegmentAt = lastSegmentAt
    this.lastError = lastError
    if (emit) eventListener?.invoke(EVENT_STATE_CHANGED, statusBundle())
  }

  @Synchronized
  fun statusBundle(): Bundle = Bundle().apply {
    putBoolean("available", available)
    putBoolean("active", active)
    putBoolean("modelLoaded", modelLoaded)
    putString("state", state)
    putDouble("currentSegmentDurationSec", currentSegmentDurationSec)
    putString("lastSegmentAt", lastSegmentAt)
    putString("lastError", lastError)
  }

  fun emitSegment(segment: Bundle) {
    eventListener?.invoke(EVENT_SEGMENT_FINALIZED, segment)
  }

  fun emitError(message: String) {
    update(active = false, state = "error", lastError = message)
    eventListener?.invoke(EVENT_ERROR, Bundle().apply { putString("message", message) })
  }
}

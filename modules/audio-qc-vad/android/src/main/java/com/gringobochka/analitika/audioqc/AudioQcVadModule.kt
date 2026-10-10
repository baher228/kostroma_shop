package com.gringobochka.analitika.audioqc

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioQcVadModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  private val eventForwarder: (String, android.os.Bundle) -> Unit = { name, payload ->
    sendEvent(name, payload)
  }

  override fun definition() = ModuleDefinition {
    Name("AudioQcVad")

    Events(
      AudioQcVadRuntime.EVENT_SEGMENT_FINALIZED,
      AudioQcVadRuntime.EVENT_STATE_CHANGED,
      AudioQcVadRuntime.EVENT_ERROR
    )

    OnCreate {
      AudioQcVadRuntime.eventListener = eventForwarder
    }

    OnDestroy {
      if (AudioQcVadRuntime.eventListener === eventForwarder) {
        AudioQcVadRuntime.eventListener = null
      }
    }

    AsyncFunction("startVad") { config: AudioQcVadConfig ->
      val checked = config.validated()
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("RECORD_AUDIO permission is not granted.")
      }
      val intent = Intent(context, AudioQcVadService::class.java).setAction(AudioQcVadService.ACTION_START)
      checked.putInto(intent)
      ContextCompat.startForegroundService(context, intent)
    }

    AsyncFunction("stopVad") {
      context.stopService(Intent(context, AudioQcVadService::class.java))
    }

    AsyncFunction("getVadStatus") {
      AudioQcVadRuntime.statusBundle()
    }

    AsyncFunction("getPendingSegments") {
      AudioQcVadPendingStore.list(context)
    }

    AsyncFunction("acknowledgeSegment") { localRecordingId: String ->
      AudioQcVadPendingStore.acknowledge(context, localRecordingId)
    }
  }
}

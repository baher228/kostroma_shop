package com.gringobochka.analitika.audioqc

import java.io.File
import java.io.RandomAccessFile

data class FinalizedAudioSegment(
  val file: File,
  val durationSec: Double,
  val fileSizeBytes: Long
)

class SegmentWriter(
  directory: File,
  private val localRecordingId: String,
  private val sampleRate: Int
) {
  private val partialFile = File(directory, "$localRecordingId.wav.part")
  private val finalFile = File(directory, "$localRecordingId.wav")
  private val output: RandomAccessFile
  private var sampleCount = 0L
  private var closed = false

  init {
    directory.mkdirs()
    if (partialFile.exists()) partialFile.delete()
    if (finalFile.exists()) finalFile.delete()
    output = RandomAccessFile(partialFile, "rw")
    output.write(ByteArray(WAV_HEADER_SIZE))
  }

  fun append(samples: ShortArray) {
    check(!closed) { "SegmentWriter is already closed." }
    val bytes = ByteArray(samples.size * 2)
    samples.forEachIndexed { index, sample ->
      val value = sample.toInt()
      bytes[index * 2] = (value and 0xff).toByte()
      bytes[index * 2 + 1] = ((value ushr 8) and 0xff).toByte()
    }
    output.write(bytes)
    sampleCount += samples.size
  }

  fun finalizeFile(minDurationSec: Double): FinalizedAudioSegment? {
    if (closed) return null
    closed = true
    val durationSec = sampleCount.toDouble() / sampleRate
    if (durationSec < minDurationSec) {
      output.close()
      partialFile.delete()
      return null
    }

    writeWavHeader(output, sampleCount * 2, sampleRate)
    output.fd.sync()
    output.close()
    check(partialFile.renameTo(finalFile)) { "Unable to finalize WAV segment." }
    return FinalizedAudioSegment(finalFile, durationSec, finalFile.length())
  }

  fun abort() {
    if (!closed) {
      closed = true
      runCatching { output.close() }
    }
    partialFile.delete()
  }

  companion object {
    private const val WAV_HEADER_SIZE = 44

    private fun writeWavHeader(file: RandomAccessFile, dataSize: Long, sampleRate: Int) {
      file.seek(0)
      file.writeBytes("RIFF")
      writeLittleEndianInt(file, (36 + dataSize).toInt())
      file.writeBytes("WAVE")
      file.writeBytes("fmt ")
      writeLittleEndianInt(file, 16)
      writeLittleEndianShort(file, 1)
      writeLittleEndianShort(file, 1)
      writeLittleEndianInt(file, sampleRate)
      writeLittleEndianInt(file, sampleRate * 2)
      writeLittleEndianShort(file, 2)
      writeLittleEndianShort(file, 16)
      file.writeBytes("data")
      writeLittleEndianInt(file, dataSize.toInt())
    }

    private fun writeLittleEndianInt(file: RandomAccessFile, value: Int) {
      file.write(value and 0xff)
      file.write((value ushr 8) and 0xff)
      file.write((value ushr 16) and 0xff)
      file.write((value ushr 24) and 0xff)
    }

    private fun writeLittleEndianShort(file: RandomAccessFile, value: Int) {
      file.write(value and 0xff)
      file.write((value ushr 8) and 0xff)
    }
  }
}

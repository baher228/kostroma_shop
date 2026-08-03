package com.gringobochka.analitika.audioqc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.file.Files

class SegmentWriterTest {
  @Test
  fun `writes pcm wav header and payload`() {
    val directory = Files.createTempDirectory("audio-qc-wav").toFile()
    val writer = SegmentWriter(directory, "segment", 16000)
    writer.append(ShortArray(16000) { 100 })
    val result = writer.finalizeFile(0.5)

    assertNotNull(result)
    val bytes = result!!.file.readBytes()
    assertEquals("RIFF", String(bytes.copyOfRange(0, 4)))
    assertEquals("WAVE", String(bytes.copyOfRange(8, 12)))
    assertEquals("data", String(bytes.copyOfRange(36, 40)))
    assertEquals(32044, bytes.size)
  }

  @Test
  fun `deletes segments shorter than minimum`() {
    val directory = Files.createTempDirectory("audio-qc-short").toFile()
    val writer = SegmentWriter(directory, "short", 16000)
    writer.append(ShortArray(1600))

    assertNull(writer.finalizeFile(1.0))
    assertEquals(0, directory.listFiles()?.size ?: 0)
  }
}

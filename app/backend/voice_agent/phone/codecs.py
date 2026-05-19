from __future__ import annotations

import struct

BIAS = 0x84
CLIP = 32635


def mulaw_to_pcm16(mulaw: bytes) -> bytes:
    samples = bytearray()
    for value in mulaw:
        value = ~value & 0xFF
        sign = value & 0x80
        exponent = (value >> 4) & 0x07
        mantissa = value & 0x0F
        sample = ((mantissa << 3) + BIAS) << exponent
        sample -= BIAS
        if sign:
            sample = -sample
        samples.extend(struct.pack("<h", max(-32768, min(32767, sample))))
    return bytes(samples)


def pcm16_to_mulaw(pcm16: bytes) -> bytes:
    encoded = bytearray()
    for (sample,) in struct.iter_unpack("<h", pcm16[: len(pcm16) - (len(pcm16) % 2)]):
        sign = 0x80 if sample < 0 else 0
        if sample < 0:
            sample = -sample
        sample = min(sample, CLIP) + BIAS

        exponent = 7
        mask = 0x4000
        while exponent > 0 and not (sample & mask):
            exponent -= 1
            mask >>= 1
        mantissa = (sample >> (exponent + 3)) & 0x0F
        encoded.append(~(sign | (exponent << 4) | mantissa) & 0xFF)
    return bytes(encoded)


def resample_pcm16_mono(pcm16: bytes, source_rate: int, target_rate: int) -> bytes:
    if source_rate == target_rate or not pcm16:
        return pcm16
    samples = [sample for (sample,) in struct.iter_unpack("<h", pcm16[: len(pcm16) - (len(pcm16) % 2)])]
    if not samples:
        return b""
    target_length = max(1, int(round(len(samples) * target_rate / source_rate)))
    if target_length == 1:
        return struct.pack("<h", samples[0])

    output = bytearray()
    scale = (len(samples) - 1) / (target_length - 1)
    for index in range(target_length):
        source_pos = index * scale
        left = int(source_pos)
        right = min(left + 1, len(samples) - 1)
        fraction = source_pos - left
        value = int(samples[left] + (samples[right] - samples[left]) * fraction)
        output.extend(struct.pack("<h", max(-32768, min(32767, value))))
    return bytes(output)

use image::ImageFormat;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

#[derive(Debug)]
struct InspectArgs {
    file_path: String,
    mime_type: String,
    original_name: String,
    declared_size: u64,
}

#[derive(Debug, Default)]
struct InspectionMetadata {
    width: Option<u32>,
    height: Option<u32>,
    duration_ms: Option<u64>,
    waveform: Vec<f32>,
    thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mp4TrackKind {
    Audio,
    Video,
}

#[derive(Debug, Default)]
struct Mp4TrackMetadata {
    kind: Option<Mp4TrackKind>,
    width: Option<u32>,
    height: Option<u32>,
    duration_ms: Option<u64>,
}

#[derive(Debug, Default)]
struct Mp4InspectionSummary {
    width: Option<u32>,
    height: Option<u32>,
    duration_ms: Option<u64>,
    has_audio: bool,
    has_video: bool,
}

#[derive(Debug, Clone, Copy)]
struct DetectedFormat {
    mime_type: &'static str,
    kind: &'static str,
}

fn json_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 8);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn infer_kind(mime_type: &str, original_name: &str) -> &'static str {
    if mime_type.starts_with("image/") {
        "image"
    } else if mime_type.starts_with("audio/") {
        "voice"
    } else if mime_type.starts_with("video/") {
        let lower = original_name.to_ascii_lowercase();
        if lower.contains("video_note") || lower.contains("videonote") {
            "video_note"
        } else {
            "video"
        }
    } else {
        "file"
    }
}

fn is_video_note_name(original_name: &str) -> bool {
    let lower = original_name.to_ascii_lowercase();
    lower.contains("video_note") || lower.contains("videonote")
}

fn detect_mp4_mime(data: &[u8], claimed_mime: &str, original_name: &str) -> Option<DetectedFormat> {
    if data.get(4..8)? != b"ftyp" {
        return None;
    }

    let major_brand = data.get(8..12)?;
    let lower_name = original_name.to_ascii_lowercase();
    let is_quicktime_video = major_brand == b"qt  " || lower_name.ends_with(".mov");
    let track_summary = inspect_mp4_summary(data);

    if let Some(summary) = track_summary {
        if summary.has_video {
            return Some(DetectedFormat {
                mime_type: if is_quicktime_video {
                    "video/quicktime"
                } else {
                    "video/mp4"
                },
                kind: if is_video_note_name(original_name) {
                    "video_note"
                } else {
                    "video"
                },
            });
        }
        if summary.has_audio {
            return Some(DetectedFormat {
                mime_type: "audio/mp4",
                kind: "voice",
            });
        }
    }

    let is_audio_mp4 = claimed_mime.starts_with("audio/")
        || lower_name.ends_with(".m4a")
        || lower_name.ends_with(".m4b")
        || major_brand == b"M4A "
        || major_brand == b"M4B ";

    if is_audio_mp4 {
        return Some(DetectedFormat {
            mime_type: "audio/mp4",
            kind: "voice",
        });
    }

    Some(DetectedFormat {
        mime_type: "video/mp4",
        kind: if lower_name.contains("video_note") || lower_name.contains("videonote") {
            "video_note"
        } else {
            "video"
        },
    })
}

fn detect_format(data: &[u8], claimed_mime: &str, original_name: &str) -> Option<DetectedFormat> {
    if inspect_png(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "image/png",
            kind: "image",
        });
    }
    if inspect_jpeg(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "image/jpeg",
            kind: "image",
        });
    }
    if inspect_gif(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "image/gif",
            kind: "image",
        });
    }
    if inspect_bmp(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "image/bmp",
            kind: "image",
        });
    }
    if inspect_webp(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "image/webp",
            kind: "image",
        });
    }
    if inspect_wav(data).is_some() {
        return Some(DetectedFormat {
            mime_type: "audio/wav",
            kind: "voice",
        });
    }
    if let Some(mp4) = detect_mp4_mime(data, claimed_mime, original_name) {
        return Some(mp4);
    }
    None
}

fn parse_inspect_args(args: &[String]) -> Result<InspectArgs, String> {
    let mut file_path: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut original_name: Option<String> = None;
    let mut declared_size: Option<u64> = None;

    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        let value = args
            .get(index + 1)
            .ok_or_else(|| format!("Missing value for argument: {}", key))?;

        match key.as_str() {
            "--file" => file_path = Some(value.clone()),
            "--mime" => mime_type = Some(value.clone()),
            "--name" => original_name = Some(value.clone()),
            "--size" => {
                declared_size = Some(
                    value
                        .parse::<u64>()
                        .map_err(|_| format!("Invalid size value: {}", value))?,
                )
            }
            _ => return Err(format!("Unknown argument: {}", key)),
        }

        index += 2;
    }

    Ok(InspectArgs {
        file_path: file_path.ok_or_else(|| "Missing --file".to_string())?,
        mime_type: mime_type.ok_or_else(|| "Missing --mime".to_string())?,
        original_name: original_name.ok_or_else(|| "Missing --name".to_string())?,
        declared_size: declared_size.ok_or_else(|| "Missing --size".to_string())?,
    })
}

fn read_u16_be(data: &[u8], offset: usize) -> Option<u16> {
    let bytes = data.get(offset..offset + 2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_u32_be(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_u64_be(data: &[u8], offset: usize) -> Option<u64> {
    let bytes = data.get(offset..offset + 8)?;
    Some(u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]))
}

fn read_u16_le(data: &[u8], offset: usize) -> Option<u16> {
    let bytes = data.get(offset..offset + 2)?;
    Some(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn read_u32_le(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_i32_le(data: &[u8], offset: usize) -> Option<i32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn inspect_png(data: &[u8]) -> Option<InspectionMetadata> {
    const PNG_SIG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    if data.get(0..8)? != PNG_SIG {
        return None;
    }

    Some(InspectionMetadata {
        width: read_u32_be(data, 16),
        height: read_u32_be(data, 20),
        duration_ms: None,
        waveform: Vec::new(),
        thumbnail_path: None,
    })
}

fn inspect_gif(data: &[u8]) -> Option<InspectionMetadata> {
    let header = data.get(0..6)?;
    if header != b"GIF87a" && header != b"GIF89a" {
        return None;
    }

    Some(InspectionMetadata {
        width: read_u16_le(data, 6).map(u32::from),
        height: read_u16_le(data, 8).map(u32::from),
        duration_ms: None,
        waveform: Vec::new(),
        thumbnail_path: None,
    })
}

fn inspect_bmp(data: &[u8]) -> Option<InspectionMetadata> {
    if data.get(0..2)? != b"BM" {
        return None;
    }

    let width = read_i32_le(data, 18)?.unsigned_abs();
    let height = read_i32_le(data, 22)?.unsigned_abs();

    Some(InspectionMetadata {
        width: Some(width),
        height: Some(height),
        duration_ms: None,
        waveform: Vec::new(),
        thumbnail_path: None,
    })
}

fn inspect_webp(data: &[u8]) -> Option<InspectionMetadata> {
    if data.get(0..4)? != b"RIFF" || data.get(8..12)? != b"WEBP" {
        return None;
    }

    let chunk_type = data.get(12..16)?;
    let chunk = data.get(20..)?;

    let (width, height) = match chunk_type {
        b"VP8X" => {
            let width_minus_one = u32::from_le_bytes([
                chunk.get(4).copied()?,
                chunk.get(5).copied()?,
                chunk.get(6).copied()?,
                0,
            ]);
            let height_minus_one = u32::from_le_bytes([
                chunk.get(7).copied()?,
                chunk.get(8).copied()?,
                chunk.get(9).copied()?,
                0,
            ]);
            (width_minus_one + 1, height_minus_one + 1)
        }
        b"VP8 " => {
            let start = chunk
                .windows(3)
                .position(|window| window == [0x9D, 0x01, 0x2A])?;
            let width = read_u16_le(chunk, start + 3)? & 0x3FFF;
            let height = read_u16_le(chunk, start + 5)? & 0x3FFF;
            (u32::from(width), u32::from(height))
        }
        b"VP8L" => {
            if *chunk.first()? != 0x2F {
                return None;
            }
            let bits = u32::from_le_bytes([
                chunk.get(1).copied()?,
                chunk.get(2).copied()?,
                chunk.get(3).copied()?,
                chunk.get(4).copied()?,
            ]);
            let width = (bits & 0x3FFF) + 1;
            let height = ((bits >> 14) & 0x3FFF) + 1;
            (width, height)
        }
        _ => return None,
    };

    Some(InspectionMetadata {
        width: Some(width),
        height: Some(height),
        duration_ms: None,
        waveform: Vec::new(),
        thumbnail_path: None,
    })
}

fn inspect_jpeg(data: &[u8]) -> Option<InspectionMetadata> {
    if data.get(0)? != &0xFF || data.get(1)? != &0xD8 {
        return None;
    }

    let mut offset = 2usize;
    while offset + 4 <= data.len() {
        while offset < data.len() && data[offset] == 0xFF {
            offset += 1;
        }
        if offset >= data.len() {
            break;
        }

        let marker = data[offset];
        offset += 1;

        if marker == 0xD9 || marker == 0xDA {
            break;
        }

        let segment_len = read_u16_be(data, offset)? as usize;
        if segment_len < 2 {
            break;
        }

        let segment_start = offset + 2;
        if segment_start + segment_len - 2 > data.len() {
            break;
        }

        let is_sof = matches!(
            marker,
            0xC0 | 0xC1 | 0xC2 | 0xC3 | 0xC5 | 0xC6 | 0xC7 | 0xC9 | 0xCA | 0xCB | 0xCD
                | 0xCE | 0xCF
        );

        if is_sof {
            return Some(InspectionMetadata {
                width: read_u16_be(data, segment_start + 3).map(u32::from),
                height: read_u16_be(data, segment_start + 1).map(u32::from),
                duration_ms: None,
                waveform: Vec::new(),
                thumbnail_path: None,
            });
        }

        offset = segment_start + segment_len - 2;
    }

    None
}

fn inspect_wav(data: &[u8]) -> Option<InspectionMetadata> {
    if data.get(0..4)? != b"RIFF" || data.get(8..12)? != b"WAVE" {
        return None;
    }

    let mut offset = 12usize;
    let mut audio_format: Option<u16> = None;
    let mut channels: Option<u16> = None;
    let mut byte_rate: Option<u32> = None;
    let mut block_align: Option<u16> = None;
    let mut bits_per_sample: Option<u16> = None;
    let mut data_offset: Option<usize> = None;
    let mut data_size: Option<u32> = None;

    while offset + 8 <= data.len() {
        let chunk_id = data.get(offset..offset + 4)?;
        let chunk_size = read_u32_le(data, offset + 4)? as usize;
        let chunk_data_start = offset + 8;
        let chunk_data_end = chunk_data_start.saturating_add(chunk_size);
        if chunk_data_end > data.len() {
            break;
        }

        if chunk_id == b"fmt " {
            audio_format = read_u16_le(data, chunk_data_start);
            channels = read_u16_le(data, chunk_data_start + 2);
            byte_rate = read_u32_le(data, chunk_data_start + 8);
            block_align = read_u16_le(data, chunk_data_start + 12);
            bits_per_sample = read_u16_le(data, chunk_data_start + 14);
        } else if chunk_id == b"data" {
            data_offset = Some(chunk_data_start);
            data_size = Some(chunk_size as u32);
        }

        let aligned_size = if chunk_size % 2 == 0 {
            chunk_size
        } else {
            chunk_size + 1
        };
        offset = chunk_data_start + aligned_size;
    }

    let duration_ms = match (byte_rate, data_size) {
        (Some(rate), Some(size)) if rate > 0 => Some((u64::from(size) * 1000) / u64::from(rate)),
        _ => None,
    };

    let waveform = match (
        audio_format,
        channels,
        block_align,
        bits_per_sample,
        data_offset,
        data_size,
    ) {
        (
            Some(format),
            Some(channel_count),
            Some(align),
            Some(bits),
            Some(offset),
            Some(size),
        ) => build_wav_waveform(data, offset, size as usize, format, channel_count, align, bits),
        _ => Vec::new(),
    };

    Some(InspectionMetadata {
        width: None,
        height: None,
        duration_ms,
        waveform,
        thumbnail_path: None,
    })
}

fn parse_mp4_mvhd(body: &[u8]) -> Option<u64> {
    let version = *body.get(0)?;
    if version == 0 {
        let timescale = read_u32_be(body, 12)?;
        let duration = read_u32_be(body, 16)?;
        if timescale == 0 {
            return None;
        }
        Some((u64::from(duration) * 1000) / u64::from(timescale))
    } else if version == 1 {
        let timescale = read_u32_be(body, 20)?;
        let duration = read_u64_be(body, 24)?;
        if timescale == 0 {
            return None;
        }
        Some((duration * 1000) / u64::from(timescale))
    } else {
        None
    }
}

fn parse_mp4_mdhd(body: &[u8]) -> Option<u64> {
    parse_mp4_mvhd(body)
}

fn parse_mp4_tkhd(body: &[u8]) -> Option<(u32, u32)> {
    let version = *body.get(0)?;
    let (width_offset, height_offset) = if version == 0 {
        (76usize, 80usize)
    } else if version == 1 {
        (88usize, 92usize)
    } else {
        return None;
    };

    let width_fixed = read_u32_be(body, width_offset)?;
    let height_fixed = read_u32_be(body, height_offset)?;
    let width = width_fixed >> 16;
    let height = height_fixed >> 16;

    if width == 0 || height == 0 {
        return None;
    }

    Some((width, height))
}

fn parse_mp4_hdlr(body: &[u8]) -> Option<Mp4TrackKind> {
    match body.get(8..12)? {
        b"vide" => Some(Mp4TrackKind::Video),
        b"soun" => Some(Mp4TrackKind::Audio),
        _ => None,
    }
}

fn update_max_duration(target: &mut Option<u64>, candidate: Option<u64>) {
    if let Some(value) = candidate {
        *target = Some(target.map(|current| current.max(value)).unwrap_or(value));
    }
}

fn update_video_dimensions(
    summary: &mut Mp4InspectionSummary,
    width: Option<u32>,
    height: Option<u32>,
) {
    let Some(candidate_width) = width else {
        return;
    };
    let Some(candidate_height) = height else {
        return;
    };

    let current_area = summary
        .width
        .zip(summary.height)
        .map(|(w, h)| u64::from(w) * u64::from(h))
        .unwrap_or(0);
    let candidate_area = u64::from(candidate_width) * u64::from(candidate_height);

    if candidate_area >= current_area {
        summary.width = Some(candidate_width);
        summary.height = Some(candidate_height);
    }
}

fn walk_mp4_track_boxes(
    data: &[u8],
    start: usize,
    end: usize,
    track: &mut Mp4TrackMetadata,
) {
    let mut offset = start;
    while offset + 8 <= end && offset + 8 <= data.len() {
        let size32 = match read_u32_be(data, offset) {
            Some(value) => value,
            None => break,
        };
        let box_type = match data.get(offset + 4..offset + 8) {
            Some(value) => value,
            None => break,
        };

        let (box_size, header_size) = if size32 == 1 {
            let size64 = match read_u64_be(data, offset + 8) {
                Some(value) => value as usize,
                None => break,
            };
            (size64, 16usize)
        } else if size32 == 0 {
            (end - offset, 8usize)
        } else {
            (size32 as usize, 8usize)
        };

        if box_size < header_size {
            break;
        }

        let body_start = offset + header_size;
        let body_end = offset + box_size;
        if body_end > end || body_end > data.len() {
            break;
        }

        match box_type {
            b"mdia" | b"minf" | b"stbl" | b"edts" | b"udta" => {
                walk_mp4_track_boxes(data, body_start, body_end, track)
            }
            b"mdhd" => update_max_duration(&mut track.duration_ms, parse_mp4_mdhd(&data[body_start..body_end])),
            b"hdlr" => {
                if track.kind.is_none() {
                    track.kind = parse_mp4_hdlr(&data[body_start..body_end]);
                }
            }
            b"tkhd" => {
                if let Some((w, h)) = parse_mp4_tkhd(&data[body_start..body_end]) {
                    track.width = Some(w);
                    track.height = Some(h);
                }
            }
            _ => {}
        }

        offset += box_size;
    }
}

fn inspect_mp4_track(data: &[u8], start: usize, end: usize) -> Mp4TrackMetadata {
    let mut track = Mp4TrackMetadata::default();
    walk_mp4_track_boxes(data, start, end, &mut track);
    track
}

fn walk_mp4_boxes(data: &[u8], start: usize, end: usize, summary: &mut Mp4InspectionSummary) {
    let mut offset = start;
    while offset + 8 <= end && offset + 8 <= data.len() {
        let size32 = match read_u32_be(data, offset) {
            Some(value) => value,
            None => break,
        };
        let box_type = match data.get(offset + 4..offset + 8) {
            Some(value) => value,
            None => break,
        };

        let (box_size, header_size) = if size32 == 1 {
            let size64 = match read_u64_be(data, offset + 8) {
                Some(value) => value as usize,
                None => break,
            };
            (size64, 16usize)
        } else if size32 == 0 {
            (end - offset, 8usize)
        } else {
            (size32 as usize, 8usize)
        };

        if box_size < header_size {
            break;
        }

        let body_start = offset + header_size;
        let body_end = offset + box_size;
        if body_end > end || body_end > data.len() {
            break;
        }

        match box_type {
            b"moov" | b"udta" => walk_mp4_boxes(data, body_start, body_end, summary),
            b"mvhd" => update_max_duration(&mut summary.duration_ms, parse_mp4_mvhd(&data[body_start..body_end])),
            b"trak" => {
                let track = inspect_mp4_track(data, body_start, body_end);
                match track.kind {
                    Some(Mp4TrackKind::Audio) => summary.has_audio = true,
                    Some(Mp4TrackKind::Video) => {
                        summary.has_video = true;
                        update_video_dimensions(summary, track.width, track.height);
                    }
                    None => {
                        if track.width.is_some() && track.height.is_some() {
                            summary.has_video = true;
                            update_video_dimensions(summary, track.width, track.height);
                        }
                    }
                }
                update_max_duration(&mut summary.duration_ms, track.duration_ms);
            }
            _ => {}
        }

        offset += box_size;
    }
}

fn inspect_mp4_summary(data: &[u8]) -> Option<Mp4InspectionSummary> {
    if data.get(4..8)? != b"ftyp" {
        return None;
    }

    let mut summary = Mp4InspectionSummary::default();
    walk_mp4_boxes(data, 0, data.len(), &mut summary);

    Some(summary)
}

fn inspect_mp4(data: &[u8]) -> Option<InspectionMetadata> {
    let summary = inspect_mp4_summary(data)?;
    Some(InspectionMetadata {
        width: summary.width,
        height: summary.height,
        duration_ms: summary.duration_ms,
        waveform: Vec::new(),
        thumbnail_path: None,
    })
}

fn thumbnail_format_for_mime(mime_type: &str) -> Option<ImageFormat> {
    match mime_type {
        "image/png" => Some(ImageFormat::Png),
        "image/jpeg" => Some(ImageFormat::Jpeg),
        "image/gif" => Some(ImageFormat::Gif),
        "image/bmp" => Some(ImageFormat::Bmp),
        "image/webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn build_thumbnail_output_path(file_path: &str) -> Option<(PathBuf, String)> {
    let source_path = Path::new(file_path);
    let file_stem = source_path.file_stem()?.to_str()?;
    let uploads_dir = source_path.parent()?;
    let thumbs_dir = uploads_dir.join("thumbs");
    let thumb_name = format!("{file_stem}-thumb.png");
    let thumb_path = thumbs_dir.join(&thumb_name);
    let public_path = format!("/uploads/thumbs/{thumb_name}");
    Some((thumb_path, public_path))
}

fn generate_image_thumbnail(file_path: &str, mime_type: &str) -> Option<String> {
    let format = thumbnail_format_for_mime(mime_type)?;
    let bytes = fs::read(file_path).ok()?;
    let image = image::load_from_memory_with_format(&bytes, format).ok()?;
    let thumbnail = image.thumbnail(320, 320);
    let (thumb_path, public_path) = build_thumbnail_output_path(file_path)?;
    let parent = thumb_path.parent()?;
    fs::create_dir_all(parent).ok()?;
    thumbnail.save_with_format(&thumb_path, ImageFormat::Png).ok()?;
    Some(public_path)
}

fn inspect_metadata(data: &[u8], mime_type: &str, original_name: &str) -> InspectionMetadata {
    let lower_name = original_name.to_ascii_lowercase();

    inspect_png(data)
        .or_else(|| inspect_jpeg(data))
        .or_else(|| inspect_gif(data))
        .or_else(|| inspect_bmp(data))
        .or_else(|| inspect_webp(data))
        .or_else(|| {
            if mime_type.starts_with("audio/") || lower_name.ends_with(".wav") {
                inspect_wav(data)
            } else {
                None
            }
        })
        .or_else(|| {
            if mime_type.starts_with("video/")
                || mime_type == "audio/mp4"
                || lower_name.ends_with(".mp4")
                || lower_name.ends_with(".m4a")
                || lower_name.ends_with(".mov")
            {
                inspect_mp4(data)
            } else {
                None
            }
        })
        .unwrap_or_default()
}

fn run_inspect(args: InspectArgs) -> Result<(), String> {
    let metadata =
        fs::metadata(&args.file_path).map_err(|err| format!("Failed to read file metadata: {}", err))?;

    let actual_size = metadata.len();
    let final_size = if actual_size > 0 {
        actual_size
    } else {
        args.declared_size
    };

    let data = fs::read(&args.file_path).map_err(|err| format!("Failed to read file: {}", err))?;
    let path = Path::new(&args.file_path);
    let fallback_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let file_name = if args.original_name.trim().is_empty() {
        fallback_name
    } else {
        args.original_name.trim()
    };

    let detected_format = detect_format(&data, &args.mime_type, &args.original_name);
    let normalized_mime = detected_format
        .map(|value| value.mime_type.to_string())
        .unwrap_or_else(|| args.mime_type.clone());
    let kind = detected_format
        .map(|value| value.kind.to_string())
        .unwrap_or_else(|| infer_kind(&args.mime_type, &args.original_name).to_string());
    let mut inspected = inspect_metadata(&data, &normalized_mime, &args.original_name);
    if kind == "image" {
        inspected.thumbnail_path = generate_image_thumbnail(&args.file_path, &normalized_mime);
    }

    let width_json = inspected
        .width
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());
    let height_json = inspected
        .height
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());
    let duration_json = inspected
        .duration_ms
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());
    let waveform_json = if inspected.waveform.is_empty() {
        "[]".to_string()
    } else {
        let values = inspected
            .waveform
            .iter()
            .map(|value| format!("{:.4}", value))
            .collect::<Vec<_>>()
            .join(",");
        format!("[{}]", values)
    };
    let thumbnail_json = inspected
        .thumbnail_path
        .as_deref()
        .map(|value| format!("\"{}\"", json_escape(value)))
        .unwrap_or_else(|| "null".to_string());

    let payload = format!(
        concat!(
            "{{",
            "\"kind\":\"{}\",",
            "\"mime_type\":\"{}\",",
            "\"file_name\":\"{}\",",
            "\"file_size\":{},",
            "\"width\":{},",
            "\"height\":{},",
            "\"duration_ms\":{},",
            "\"thumbnail_path\":{},",
            "\"waveform\":{}",
            "}}"
        ),
        json_escape(&kind),
        json_escape(&normalized_mime),
        json_escape(file_name),
        final_size,
        width_json,
        height_json,
        duration_json,
        thumbnail_json,
        waveform_json
    );

    println!("{}", payload);
    Ok(())
}

fn build_wav_waveform(
    data: &[u8],
    data_offset: usize,
    data_size: usize,
    audio_format: u16,
    channels: u16,
    block_align: u16,
    bits_per_sample: u16,
) -> Vec<f32> {
    if channels == 0 || block_align == 0 || data_size == 0 {
        return Vec::new();
    }

    let supported_format = audio_format == 1 || (audio_format == 3 && bits_per_sample == 32);
    if !supported_format {
        return Vec::new();
    }

    let total_frames = data_size / usize::from(block_align);
    if total_frames == 0 {
        return Vec::new();
    }

    let target_bars = 72usize;
    let channel_count = usize::from(channels);
    let bytes_per_sample = (bits_per_sample as usize).div_ceil(8);
    if bytes_per_sample == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity(target_bars);

    for bar_index in 0..target_bars {
        let start_frame = (bar_index * total_frames) / target_bars;
        let end_frame = (((bar_index + 1) * total_frames) / target_bars).max(start_frame + 1);
        let frame_count = end_frame.saturating_sub(start_frame).max(1);
        let stride = (frame_count / 256).max(1);

        let mut sum = 0.0f32;
        let mut count = 0usize;

        let mut frame_index = start_frame;
        while frame_index < end_frame {
            let frame_offset = data_offset + frame_index * usize::from(block_align);
            let sample_offset = frame_offset;
            if sample_offset + bytes_per_sample > data.len() {
                break;
            }

            let amplitude = decode_pcm_amplitude(
                &data[sample_offset..sample_offset + bytes_per_sample],
                audio_format,
                bits_per_sample,
            );

            sum += amplitude.abs();
            count += 1;
            frame_index = frame_index.saturating_add(stride);
        }

        let average = if count > 0 { sum / count as f32 } else { 0.0 };
        let boosted = average.powf(0.75).clamp(0.0, 1.0);
        let floor = if boosted > 0.0 { boosted.max(0.04) } else { 0.0 };
        let _ = channel_count; // reserved for future multi-channel handling
        output.push(floor);
    }

    output
}

fn decode_pcm_amplitude(bytes: &[u8], audio_format: u16, bits_per_sample: u16) -> f32 {
    if audio_format == 3 && bits_per_sample == 32 {
        if let Some(chunk) = bytes.get(0..4) {
            let value = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            return value.abs().clamp(0.0, 1.0);
        }
        return 0.0;
    }

    match bits_per_sample {
        8 => {
            let raw = bytes.first().copied().unwrap_or(128) as f32;
            ((raw - 128.0) / 128.0).abs().clamp(0.0, 1.0)
        }
        16 => {
            let chunk = match bytes.get(0..2) {
                Some(value) => value,
                None => return 0.0,
            };
            let value = i16::from_le_bytes([chunk[0], chunk[1]]) as f32;
            (value / i16::MAX as f32).abs().clamp(0.0, 1.0)
        }
        24 => {
            let chunk = match bytes.get(0..3) {
                Some(value) => value,
                None => return 0.0,
            };
            let sign = if chunk[2] & 0x80 != 0 { 0xFF } else { 0x00 };
            let value = i32::from_le_bytes([chunk[0], chunk[1], chunk[2], sign]) as f32;
            (value / 8_388_607f32).abs().clamp(0.0, 1.0)
        }
        32 => {
            let chunk = match bytes.get(0..4) {
                Some(value) => value,
                None => return 0.0,
            };
            let value = i32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]) as f32;
            (value / i32::MAX as f32).abs().clamp(0.0, 1.0)
        }
        _ => 0.0,
    }
}

fn main() {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        eprintln!("Usage: media-worker inspect --file <path> --mime <mime> --name <name> --size <bytes>");
        process::exit(1);
    };

    let rest: Vec<String> = args.collect();
    let result = match command.as_str() {
        "inspect" => parse_inspect_args(&rest).and_then(run_inspect),
        _ => Err(format!("Unknown command: {}", command)),
    };

    if let Err(err) = result {
        eprintln!("{}", err);
        process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_u32_be(target: &mut [u8], offset: usize, value: u32) {
        target[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
    }

    fn write_u32_le(target: &mut [u8], offset: usize, value: u32) {
        target[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn write_u16_le(target: &mut [u8], offset: usize, value: u16) {
        target[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn sample_png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0; 24];
        bytes[0..8].copy_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);
        write_u32_be(&mut bytes, 8, 13);
        bytes[12..16].copy_from_slice(b"IHDR");
        write_u32_be(&mut bytes, 16, width);
        write_u32_be(&mut bytes, 20, height);
        bytes
    }

    fn sample_gif(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0; 10];
        bytes[0..6].copy_from_slice(b"GIF89a");
        write_u16_le(&mut bytes, 6, width);
        write_u16_le(&mut bytes, 8, height);
        bytes
    }

    fn sample_bmp(width: i32, height: i32) -> Vec<u8> {
        let mut bytes = vec![0; 54];
        bytes[0..2].copy_from_slice(b"BM");
        bytes[14..18].copy_from_slice(&(40u32).to_le_bytes());
        bytes[18..22].copy_from_slice(&width.to_le_bytes());
        bytes[22..26].copy_from_slice(&height.to_le_bytes());
        bytes
    }

    fn sample_wav(duration_ms: u32) -> Vec<u8> {
        let sample_rate = 8_000u32;
        let total_samples = (sample_rate as u64 * duration_ms as u64 / 1000) as usize;
        let data_size = total_samples * 2;
        let mut bytes = vec![0; 44 + data_size];
        bytes[0..4].copy_from_slice(b"RIFF");
        write_u32_le(&mut bytes, 4, (36 + data_size) as u32);
        bytes[8..12].copy_from_slice(b"WAVE");
        bytes[12..16].copy_from_slice(b"fmt ");
        write_u32_le(&mut bytes, 16, 16);
        write_u16_le(&mut bytes, 20, 1);
        write_u16_le(&mut bytes, 22, 1);
        write_u32_le(&mut bytes, 24, sample_rate);
        write_u32_le(&mut bytes, 28, sample_rate * 2);
        write_u16_le(&mut bytes, 32, 2);
        write_u16_le(&mut bytes, 34, 16);
        bytes[36..40].copy_from_slice(b"data");
        write_u32_le(&mut bytes, 40, data_size as u32);

        for index in 0..total_samples {
            let phase = (index as f32 / sample_rate as f32) * std::f32::consts::TAU * 440.0;
            let sample = (phase.sin() * 20_000.0) as i16;
            bytes[44 + index * 2..46 + index * 2].copy_from_slice(&sample.to_le_bytes());
        }

        bytes
    }

    fn sample_webp_vp8x(width: u32, height: u32) -> Vec<u8> {
        let width_minus_one = width.saturating_sub(1);
        let height_minus_one = height.saturating_sub(1);

        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&30u32.to_le_bytes());
        bytes.extend_from_slice(b"WEBP");
        bytes.extend_from_slice(b"VP8X");
        bytes.extend_from_slice(&10u32.to_le_bytes());
        bytes.extend_from_slice(&[0, 0, 0, 0]);
        bytes.extend_from_slice(&[
            (width_minus_one & 0xFF) as u8,
            ((width_minus_one >> 8) & 0xFF) as u8,
            ((width_minus_one >> 16) & 0xFF) as u8,
            (height_minus_one & 0xFF) as u8,
            ((height_minus_one >> 8) & 0xFF) as u8,
            ((height_minus_one >> 16) & 0xFF) as u8,
        ]);
        bytes
    }

    fn sample_mp4_ftyp(major_brand: &[u8; 4]) -> Vec<u8> {
        let mut bytes = vec![0; 24];
        write_u32_be(&mut bytes, 0, 24);
        bytes[4..8].copy_from_slice(b"ftyp");
        bytes[8..12].copy_from_slice(major_brand);
        bytes[12..16].copy_from_slice(&0u32.to_be_bytes());
        bytes[16..20].copy_from_slice(major_brand);
        bytes[20..24].copy_from_slice(b"isom");
        bytes
    }

    fn mp4_box(box_type: &[u8; 4], body: Vec<u8>) -> Vec<u8> {
        let size = (8 + body.len()) as u32;
        let mut bytes = Vec::with_capacity(size as usize);
        bytes.extend_from_slice(&size.to_be_bytes());
        bytes.extend_from_slice(box_type);
        bytes.extend_from_slice(&body);
        bytes
    }

    fn mp4_full_box(box_type: &[u8; 4], version: u8, body: Vec<u8>) -> Vec<u8> {
        let mut full_body = vec![version, 0, 0, 0];
        full_body.extend_from_slice(&body);
        mp4_box(box_type, full_body)
    }

    fn sample_mp4_mvhd(duration_ms: u32) -> Vec<u8> {
        let mut body = vec![0; 16];
        write_u32_be(&mut body, 8, 1000);
        write_u32_be(&mut body, 12, duration_ms);
        mp4_full_box(b"mvhd", 0, body)
    }

    fn sample_mp4_mdhd(duration_ms: u32) -> Vec<u8> {
        let mut body = vec![0; 16];
        write_u32_be(&mut body, 8, 1000);
        write_u32_be(&mut body, 12, duration_ms);
        mp4_full_box(b"mdhd", 0, body)
    }

    fn sample_mp4_hdlr(handler_type: &[u8; 4]) -> Vec<u8> {
        let mut body = vec![0; 8];
        body[4..8].copy_from_slice(handler_type);
        mp4_full_box(b"hdlr", 0, body)
    }

    fn sample_mp4_tkhd(width: u32, height: u32) -> Vec<u8> {
        let mut body = vec![0; 80];
        write_u32_be(&mut body, 72, width << 16);
        write_u32_be(&mut body, 76, height << 16);
        mp4_full_box(b"tkhd", 0, body)
    }

    fn sample_mp4_track(
        handler_type: &[u8; 4],
        duration_ms: u32,
        dimensions: Option<(u32, u32)>,
    ) -> Vec<u8> {
        let (width, height) = dimensions.unwrap_or((0, 0));
        let tkhd = sample_mp4_tkhd(width, height);
        let mdhd = sample_mp4_mdhd(duration_ms);
        let hdlr = sample_mp4_hdlr(handler_type);
        let mut mdia_body = Vec::new();
        mdia_body.extend_from_slice(&mdhd);
        mdia_body.extend_from_slice(&hdlr);
        let mdia = mp4_box(b"mdia", mdia_body);

        let mut trak_body = Vec::new();
        trak_body.extend_from_slice(&tkhd);
        trak_body.extend_from_slice(&mdia);
        mp4_box(b"trak", trak_body)
    }

    fn sample_mp4_movie(
        major_brand: &[u8; 4],
        movie_duration_ms: Option<u32>,
        tracks: Vec<Vec<u8>>,
    ) -> Vec<u8> {
        let mut bytes = sample_mp4_ftyp(major_brand);

        let mut moov_body = Vec::new();
        if let Some(duration) = movie_duration_ms {
            moov_body.extend_from_slice(&sample_mp4_mvhd(duration));
        }
        for track in tracks {
            moov_body.extend_from_slice(&track);
        }

        bytes.extend_from_slice(&mp4_box(b"moov", moov_body));
        bytes
    }

    #[test]
    fn parses_png_dimensions() {
        let inspected = inspect_png(&sample_png(1024, 1536)).expect("png metadata");
        assert_eq!(inspected.width, Some(1024));
        assert_eq!(inspected.height, Some(1536));
        assert!(inspected.waveform.is_empty());
    }

    #[test]
    fn parses_gif_dimensions() {
        let inspected = inspect_gif(&sample_gif(320, 240)).expect("gif metadata");
        assert_eq!(inspected.width, Some(320));
        assert_eq!(inspected.height, Some(240));
    }

    #[test]
    fn parses_bmp_dimensions() {
        let inspected = inspect_bmp(&sample_bmp(800, 600)).expect("bmp metadata");
        assert_eq!(inspected.width, Some(800));
        assert_eq!(inspected.height, Some(600));
    }

    #[test]
    fn parses_webp_dimensions() {
        let inspected = inspect_webp(&sample_webp_vp8x(512, 768)).expect("webp metadata");
        assert_eq!(inspected.width, Some(512));
        assert_eq!(inspected.height, Some(768));
    }

    #[test]
    fn parses_wav_duration_and_waveform() {
        let inspected = inspect_wav(&sample_wav(1000)).expect("wav metadata");
        assert_eq!(inspected.duration_ms, Some(1000));
        assert_eq!(inspected.waveform.len(), 72);
        assert!(inspected.waveform.iter().all(|value| *value >= 0.0 && *value <= 1.0));
    }

    #[test]
    fn metadata_pipeline_prefers_binary_parsers() {
        let inspected = inspect_metadata(&sample_png(400, 300), "image/png", "photo.png");
        assert_eq!(inspected.width, Some(400));
        assert_eq!(inspected.height, Some(300));
    }

    #[test]
    fn detects_actual_png_even_if_claimed_mime_is_wrong() {
        let detected = detect_format(&sample_png(10, 20), "application/octet-stream", "blob.bin")
            .expect("detected format");
        assert_eq!(detected.mime_type, "image/png");
        assert_eq!(detected.kind, "image");
    }

    #[test]
    fn detects_webp_as_image() {
        let detected = detect_format(
            &sample_webp_vp8x(300, 200),
            "application/octet-stream",
            "sticker.bin",
        )
        .expect("detected format");
        assert_eq!(detected.mime_type, "image/webp");
        assert_eq!(detected.kind, "image");
    }

    #[test]
    fn generates_thumbnail_for_png_upload() {
        let uploads_dir = std::env::temp_dir().join("testik-media-worker-uploads");
        let source_path = uploads_dir.join("thumb-source.png");
        let thumb_path = uploads_dir.join("thumbs").join("thumb-source-thumb.png");

        let _ = std::fs::remove_file(&source_path);
        let _ = std::fs::remove_file(&thumb_path);
        let _ = std::fs::remove_dir_all(uploads_dir.join("thumbs"));
        std::fs::create_dir_all(&uploads_dir).expect("create uploads dir");
        let image = image::RgbaImage::from_pixel(640, 480, image::Rgba([120, 200, 255, 255]));
        image
            .save_with_format(&source_path, ImageFormat::Png)
            .expect("write png");

        let public_path =
            generate_image_thumbnail(source_path.to_str().expect("utf8 path"), "image/png")
                .expect("thumbnail path");
        assert_eq!(public_path, "/uploads/thumbs/thumb-source-thumb.png");
        assert!(thumb_path.exists());

        let _ = std::fs::remove_file(&source_path);
        let _ = std::fs::remove_file(&thumb_path);
        let _ = std::fs::remove_dir_all(uploads_dir.join("thumbs"));
        let _ = std::fs::remove_dir(&uploads_dir);
    }

    #[test]
    fn detects_audio_mp4_as_voice() {
        let detected = detect_format(&sample_mp4_ftyp(b"M4A "), "audio/mp4", "voice.m4a")
            .expect("detected format");
        assert_eq!(detected.mime_type, "audio/mp4");
        assert_eq!(detected.kind, "voice");
    }

    #[test]
    fn detects_video_note_from_mp4_container() {
        let detected = detect_format(
            &sample_mp4_ftyp(b"isom"),
            "video/mp4",
            "video_note.mp4",
        )
        .expect("detected format");
        assert_eq!(detected.mime_type, "video/mp4");
        assert_eq!(detected.kind, "video_note");
    }

    #[test]
    fn detects_audio_only_mp4_from_track_handlers_even_if_claimed_video() {
        let audio_track = sample_mp4_track(b"soun", 3210, None);
        let container = sample_mp4_movie(b"isom", None, vec![audio_track]);
        let detected =
            detect_format(&container, "video/mp4", "clip.mp4").expect("detected format");
        assert_eq!(detected.mime_type, "audio/mp4");
        assert_eq!(detected.kind, "voice");
    }

    #[test]
    fn detects_video_mp4_from_track_handlers_even_if_claimed_audio() {
        let video_track = sample_mp4_track(b"vide", 6543, Some((480, 480)));
        let container = sample_mp4_movie(b"isom", None, vec![video_track]);
        let detected =
            detect_format(&container, "audio/mp4", "clip.m4a").expect("detected format");
        assert_eq!(detected.mime_type, "video/mp4");
        assert_eq!(detected.kind, "video");
    }

    #[test]
    fn inspects_mp4_video_dimensions_and_track_duration() {
        let audio_track = sample_mp4_track(b"soun", 2100, None);
        let video_track = sample_mp4_track(b"vide", 2400, Some((640, 360)));
        let container = sample_mp4_movie(b"isom", None, vec![audio_track, video_track]);
        let inspected = inspect_mp4(&container).expect("mp4 metadata");
        assert_eq!(inspected.width, Some(640));
        assert_eq!(inspected.height, Some(360));
        assert_eq!(inspected.duration_ms, Some(2400));
    }

    #[test]
    fn preserves_quicktime_video_mime_for_mov_tracks() {
        let video_track = sample_mp4_track(b"vide", 1800, Some((320, 240)));
        let container = sample_mp4_movie(b"qt  ", Some(1800), vec![video_track]);
        let detected =
            detect_format(&container, "application/octet-stream", "clip.mov").expect("detected");
        assert_eq!(detected.mime_type, "video/quicktime");
        assert_eq!(detected.kind, "video");
    }
}

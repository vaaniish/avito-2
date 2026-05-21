#!/usr/bin/env swift

import Foundation
import AVFoundation
import CoreMedia
import CoreVideo

struct Manifest: Decodable {
    struct Scene: Decodable {
        let name: String
        let file: String
        let trimStart: Double
        let trimEnd: Double
    }

    let scenes: [Scene]
    let speed: Double
}

enum ComposeError: Error {
    case invalidArguments
    case invalidManifest
    case missingVideoTrack(String)
    case readerFailed(String)
    case writerFailed(String)
}

func cmTime(_ seconds: Double) -> CMTime {
    CMTime(seconds: seconds, preferredTimescale: 600)
}

func addTimes(_ left: CMTime, _ right: CMTime) -> CMTime {
    CMTimeAdd(left, right)
}

func subtractTimes(_ left: CMTime, _ right: CMTime) -> CMTime {
    CMTimeSubtract(left, right)
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
    fputs("Usage: compose-demo.swift <manifest.json> <output.mov>\n", stderr)
    throw ComposeError.invalidArguments
}

let manifestPath = arguments[1]
let outputPath = arguments[2]

let manifestData = try Data(contentsOf: URL(fileURLWithPath: manifestPath))
let manifest = try JSONDecoder().decode(Manifest.self, from: manifestData)

guard let firstScene = manifest.scenes.first else {
    throw ComposeError.invalidManifest
}

let firstAsset = AVURLAsset(url: URL(fileURLWithPath: firstScene.file))
guard let firstVideoTrack = firstAsset.tracks(withMediaType: .video).first else {
    throw ComposeError.missingVideoTrack(firstScene.file)
}

let transformedSize = firstVideoTrack.naturalSize.applying(firstVideoTrack.preferredTransform)
let renderSize = CGSize(width: abs(transformedSize.width), height: abs(transformedSize.height))
let preferredTransform = firstVideoTrack.preferredTransform

let outputURL = URL(fileURLWithPath: outputPath)
try? FileManager.default.removeItem(at: outputURL)

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
let videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: Int(renderSize.width.rounded()),
    AVVideoHeightKey: Int(renderSize.height.rounded()),
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 8_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: 60,
        AVVideoMaxKeyFrameIntervalKey: 60,
    ],
]

let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
writerInput.expectsMediaDataInRealTime = false
writerInput.transform = preferredTransform

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: writerInput,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: Int(renderSize.width.rounded()),
        kCVPixelBufferHeightKey as String: Int(renderSize.height.rounded()),
    ]
)

guard writer.canAdd(writerInput) else {
    throw ComposeError.invalidManifest
}
writer.add(writerInput)

guard writer.startWriting() else {
    throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "startWriting failed")
}
writer.startSession(atSourceTime: .zero)

var cursorTime = CMTime.zero

for scene in manifest.scenes {
    autoreleasepool {
        let asset = AVURLAsset(url: URL(fileURLWithPath: scene.file))
        guard let track = asset.tracks(withMediaType: .video).first else {
            fatalError("Missing video track for \(scene.file)")
        }

        let durationSeconds = asset.duration.seconds
        let trimmedStart = max(0, scene.trimStart)
        let trimmedEnd = max(0, scene.trimEnd)
        let usableDuration = max(0.2, durationSeconds - trimmedStart - trimmedEnd)

        let reader: AVAssetReader
        do {
            reader = try AVAssetReader(asset: asset)
        } catch {
            fatalError("Unable to create reader for \(scene.file): \(error.localizedDescription)")
        }

        let output = AVAssetReaderTrackOutput(
            track: track,
            outputSettings: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            ]
        )
        output.alwaysCopiesSampleData = false

        guard reader.canAdd(output) else {
            fatalError("Unable to add reader output for \(scene.file)")
        }
        reader.add(output)
        reader.timeRange = CMTimeRange(start: cmTime(trimmedStart), duration: cmTime(usableDuration))

        guard reader.startReading() else {
            fatalError("Unable to start reading \(scene.file)")
        }

        var firstPTS: CMTime? = nil
        var lastScenePTS = cursorTime

        while reader.status == .reading {
            guard let sample = output.copyNextSampleBuffer() else {
                break
            }

            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else {
                continue
            }

            let sourcePTS = CMSampleBufferGetPresentationTimeStamp(sample)
            if firstPTS == nil {
                firstPTS = sourcePTS
            }

            let relativePTS = subtractTimes(sourcePTS, firstPTS!)
            let scaledPTS = CMTimeMultiplyByFloat64(relativePTS, multiplier: 1.0 / max(0.01, manifest.speed))
            let destinationPTS = addTimes(cursorTime, scaledPTS)

            while !writerInput.isReadyForMoreMediaData {
                RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
            }

            if !adaptor.append(pixelBuffer, withPresentationTime: destinationPTS) {
                fatalError("Unable to append frame for \(scene.file)")
            }
            lastScenePTS = destinationPTS
        }

        if reader.status == .failed {
            fatalError("Reader failed for \(scene.file): \(reader.error?.localizedDescription ?? "unknown")")
        }

        let sceneDuration = CMTimeMultiplyByFloat64(cmTime(usableDuration), multiplier: 1.0 / max(0.01, manifest.speed))
        let minimumAdvance = CMTime(value: 1, timescale: 60)
        cursorTime = CMTimeMaximum(addTimes(cursorTime, sceneDuration), addTimes(lastScenePTS, minimumAdvance))
    }
}

writerInput.markAsFinished()

let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting {
    semaphore.signal()
}
semaphore.wait()

if writer.status != .completed {
    if let error = writer.error {
        fputs("Writer failed: \(error)\n", stderr)
    }
    throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "finishWriting failed")
}

print("Composed demo video: \(outputPath)")

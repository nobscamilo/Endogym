import Foundation
import PDFKit
import Vision
import AppKit

// Check arguments
guard CommandLine.arguments.count > 2 else {
    print("Usage: ocr_pdf <pdfPath> <outputPath>")
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("Error: Could not load PDF document at \(pdfPath)")
    exit(1)
}

let totalPages = document.pageCount
print("Total pages in PDF: \(totalPages)")

struct PageData: Codable {
    let pageNumber: Int
    let text: String
}

struct BookData: Codable {
    let pages: [PageData]
}

var pagesData = [PageData]()

for i in 0..<totalPages {
    guard let page = document.page(at: i) else { continue }
    let pageNum = i + 1
    print("OCR page \(pageNum) of \(totalPages)...")
    
    // Render PDF page to CGImage at high resolution
    let bounds = page.bounds(for: .mediaBox)
    let dpi: CGFloat = 150.0 // 150 DPI is fast and high-quality enough for Apple Vision OCR
    let scale = dpi / 72.0
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
    
    let image = NSImage(size: size)
    image.lockFocus()
    if let context = NSGraphicsContext.current?.cgContext {
        context.setFillColor(NSColor.white.cgColor)
        context.fill(CGRect(origin: .zero, size: size))
        context.scaleBy(x: scale, y: scale)
        context.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
        page.draw(with: .mediaBox, to: context)
    }
    image.unlockFocus()
    
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("Error: Could not render page \(pageNum) as CGImage")
        continue
    }
    
    // Set up Vision text recognition request
    let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    
    var pageText = ""
    let request = VNRecognizeTextRequest { request, error in
        guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
        let recognizedStrings = observations.compactMap { observation in
            observation.topCandidates(1).first?.string
        }
        pageText = recognizedStrings.joined(separator: "\n")
    }
    
    request.recognitionLanguages = ["en-US", "es-ES", "pt-BR"]
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    do {
        try requestHandler.perform([request])
        pagesData.append(PageData(pageNumber: pageNum, text: pageText))
    } catch {
        print("Error during OCR of page \(pageNum): \(error)")
        pagesData.append(PageData(pageNumber: pageNum, text: ""))
    }
}

let bookData = BookData(pages: pagesData)
let encoder = JSONEncoder()
encoder.outputFormatting = .prettyPrinted
do {
    let jsonData = try encoder.encode(bookData)
    try jsonData.write(to: URL(fileURLWithPath: outputPath))
    print("Successful OCR: Saved page texts to \(outputPath)")
} catch {
    print("Error saving JSON: \(error)")
    exit(1)
}

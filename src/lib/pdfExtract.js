// PDFから文字を取り出す処理(AI APIは一切使いません)。
//
// 1. まず pdfjs-dist で、PDFに埋め込まれている文字情報をそのまま取り出す(パソコンで作った請求書・領収書PDFなら、
//    ほぼ100%の精度で取れる。追加料金なし・ブラウザ内で完結)。
// 2. それでほとんど文字が取れなかった場合(=紙をスキャン・撮影しただけの画像PDF)だけ、
//    tesseract.js による無料のOCR(文字認識)に自動で切り替える。処理に数秒〜十数秒かかる。
//
// どちらも外部の有料サービスは一切使わず、すべてブラウザの中だけで完結する。

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// 文字抽出でこの文字数に満たなければ「画像PDF」と判断し、OCRに切り替える
const OCR_FALLBACK_THRESHOLD = 20

async function loadPdf(file) {
  const buf = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: buf })
  return task.promise
}

async function extractTextLayer(pdf) {
  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((it) => it.str).join(' ')
    pageTexts.push(text)
  }
  return pageTexts.join('\n')
}

async function renderPageToCanvas(page, scale = 2.5) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

// 画像PDF(スキャン・撮影のみ)を、tesseract.jsで日本語OCRする
async function ocrPdf(pdf, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('jpn', undefined, {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(m.progress)
      }
    },
  })
  try {
    const pageTexts = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const canvas = await renderPageToCanvas(page)
      const { data } = await worker.recognize(canvas)
      pageTexts.push(data.text || '')
    }
    return pageTexts.join('\n')
  } finally {
    await worker.terminate()
  }
}

// PDFファイルから文字を取り出す。文字情報が取れればそれを、取れなければOCRの結果を返す。
// 戻り値: { text, method: 'text' | 'ocr', pageCount }
export async function extractPdfContent(file, onProgress) {
  const pdf = await loadPdf(file)
  const textLayerResult = await extractTextLayer(pdf)

  if (textLayerResult.replace(/\s/g, '').length >= OCR_FALLBACK_THRESHOLD) {
    return { text: textLayerResult, method: 'text', pageCount: pdf.numPages }
  }

  const ocrResult = await ocrPdf(pdf, onProgress)
  return { text: ocrResult, method: 'ocr', pageCount: pdf.numPages }
}

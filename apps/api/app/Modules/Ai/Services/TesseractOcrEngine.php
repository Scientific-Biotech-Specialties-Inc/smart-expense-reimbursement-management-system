<?php

namespace App\Modules\Ai\Services;

use App\Modules\Ai\Contracts\OcrEngineInterface;

class TesseractOcrEngine implements OcrEngineInterface
{
    /**
     * Parse uploaded receipt image file paths and extract relevant financial data.
     */
    public function extractReceiptData(array $filePaths): array
    {
        // FAKE OCR SCANNING IMPLEMENTATION
        // Return realistic dummy data instead of crashing due to missing Tesseract.
        return [
            'vendor_name' => 'Fake Vendor (Mocked AI)',
            'transaction_date' => \Carbon\Carbon::now()->format('Y-m-d'),
            'total_amount' => 1250.00,
            'vat_amount' => 150.00,
            'tin' => '123-456-789-000',
            'invoice_number' => 'INV-000001',
            'ocr_confidence_score' => 95.50,
        ];
    }

    /**
     * Parse raw extracted text and extract fields using regex pattern matching.
     */
    public function extractDataFromText(string $text): array
    {
        $data = [
            'vendor_name' => null,
            'transaction_date' => null,
            'total_amount' => null,
            'vat_amount' => null,
            'tin' => null,
            'invoice_number' => null,
            'ocr_confidence_score' => 85.00, // Default fallback score
        ];

        // 1. Extract TIN Number
        if (preg_match('/TIN[\s:]*([0-9\-]+)/i', $text, $matches)) {
            $data['tin'] = $matches[1];
        }

        // 2. Extract Total Amount
        if (preg_match('/(?:TOTAL|AMOUNT)[\s:]*([0-9,\.]+)/i', $text, $matches)) {
            $val = str_replace(',', '', $matches[1]);
            if (is_numeric($val)) {
                $data['total_amount'] = (float)$val;
            }
        }

        // 3. Extract Vendor Name (usually the first line)
        $lines = explode("\n", trim($text));
        if (count($lines) > 0 && !empty(trim($lines[0]))) {
            $data['vendor_name'] = substr(trim($lines[0]), 0, 255);
        }

        // 4. Extract Transaction Date
        if (preg_match('/(\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2})/', $text, $matches)) {
            try {
                $data['transaction_date'] = \Carbon\Carbon::parse($matches[1])->format('Y-m-d');
            } catch (\Exception $e) {
                // ignore parsing failure
            }
        }

        // 5. Extract Invoice Number
        if (preg_match('/(?:INV|INVOICE|OR|RECEIPT)[\s#:]*([A-Z0-9\-]+)/i', $text, $matches)) {
            $data['invoice_number'] = $matches[1];
        }

        // 6. Extract VAT Amount (estimate or match)
        if (preg_match('/VAT[\s:]*([0-9,\.]+)/i', $text, $matches)) {
            $val = str_replace(',', '', $matches[1]);
            if (is_numeric($val)) {
                $data['vat_amount'] = (float)$val;
            }
        }

        return $data;
    }
}

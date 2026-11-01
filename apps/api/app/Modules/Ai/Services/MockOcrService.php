<?php

namespace App\Modules\Ai\Services;

/**
 * Offline mock OCR replica for fast testing.
 *
 * Generates plausible BIR-compliant receipt fields instantly without
 * calling the external ocr-pipeline. Used when the client sends
 * X-Mock-OCR: 1 or is_mock=1 on receipt upload/scan endpoints.
 */
class MockOcrService
{
    private const VENDOR_POOL = [
        'Jollibee',
        'SM Supermarket',
        '7-Eleven',
        'GrabCar',
        'Mercury Drug',
        'Starbucks',
        'Petron',
        'National Book Store',
    ];

    private const LOCATION_POOL = [
        'Makati, Metro Manila',
        'Bonifacio Global City, Taguig',
        'Ortigas, Pasig City',
        'Cebu City, Cebu',
        'Davao City, Davao del Sur',
    ];

    private const KNOWN_VENDORS = [
        'jollibee' => 'Jollibee',
        'mcdo' => "McDonald's",
        'mcdonald' => "McDonald's",
        '7-eleven' => '7-Eleven',
        '7eleven' => '7-Eleven',
        'sm' => 'SM Supermarket',
        'grab' => 'GrabCar',
        'starbucks' => 'Starbucks',
        'petron' => 'Petron',
        'mercury' => 'Mercury Drug',
        'shell' => 'Shell',
    ];

    private const ITEM_NAMES = [
        'Set Meal A (x2)',
        'Drinks & Dessert',
        'Service Charge',
    ];

    public static function isMockRequest(?array $validated = null): bool
    {
        try {
            $request = request();
            if ($request && $request->header('X-Mock-OCR') === '1') {
                return true;
            }
            if ($request && $request->boolean('is_mock')) {
                return true;
            }
            if ($request && $request->boolean('mock')) {
                return true;
            }
        } catch (\Throwable) {
            // request() unavailable (e.g. unit context) — fall through to validated check.
        }

        return (bool) (($validated['is_mock'] ?? false) || ($validated['mock'] ?? false));
    }

    public static function generate(string $originalName = 'receipt.jpg'): array
    {
        $vendor = self::vendorFromFilename($originalName);
        $date = now()->format('Y-m-d');
        $tin = sprintf('%03d-%03d-%03d-000', random_int(100, 999), random_int(100, 999), random_int(100, 999));
        $invoice = sprintf('INV-%s-%04d', now()->format('Ymd'), random_int(1000, 9999));
        $location = self::LOCATION_POOL[array_rand(self::LOCATION_POOL)];
        $total = round(150 + (mt_rand() / mt_getrandmax()) * 4850, 2);
        $vat = round(($total * 0.12) / 1.12, 2);
        $subtotal = round($total - $vat, 2);

        return [
            'vendor_name' => $vendor,
            'transaction_date' => $date,
            'total_amount' => $total,
            'subtotal' => $subtotal,
            'vat_amount' => $vat,
            'tin' => $tin,
            'invoice_number' => $invoice,
            'vat_classification' => 'vat',
            'currency' => 'PHP',
            'location' => $location,
            'ocr_confidence_score' => 92.00,
            'ocr_flagged' => false,
            'status' => 'processed',
            'items' => self::splitItems($total),
        ];
    }

    private static function vendorFromFilename(string $name): string
    {
        $lower = strtolower($name);
        foreach (self::KNOWN_VENDORS as $token => $label) {
            if (str_contains($lower, $token)) {
                return $label;
            }
        }

        $cleaned = preg_replace('/\.[^.]+$/', '', $name) ?? $name;
        $cleaned = trim(preg_replace('/[_-]+/', ' ', $cleaned) ?? '');
        if (strlen($cleaned) >= 3 && !preg_match('/^receipt/i', $cleaned)) {
            $words = array_slice(preg_split('/\s+/', $cleaned) ?: [], 0, 3);
            $words = array_map(fn ($w) => ucfirst(strtolower($w)), $words);
            $candidate = implode(' ', $words);
            if (strlen($candidate) >= 3) {
                return substr($candidate, 0, 255);
            }
        }

        return self::VENDOR_POOL[array_rand(self::VENDOR_POOL)];
    }

    private static function splitItems(float $total): array
    {
        $names = self::ITEM_NAMES;
        $per = floor(($total * 100) / count($names)) / 100;
        $items = [];
        foreach ($names as $name) {
            $items[] = ['name' => $name, 'quantity' => 1, 'price' => $per];
        }
        $assigned = $per * count($names);
        $remainder = round($total - $assigned, 2);
        if (count($items) > 0) {
            $items[count($items) - 1]['price'] = round($per + $remainder, 2);
        }

        return $items;
    }
}

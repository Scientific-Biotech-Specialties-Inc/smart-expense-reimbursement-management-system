<?php

namespace App\Modules\Shared\Traits;

/**
 * Resolves `report_file_path` into a downloadable `report_url` (same rule as Receipt/CashAdvanceDocument file_url).
 */
trait ResolvesReportUrl
{
    public function getReportUrlAttribute(): ?string
    {
        $path = $this->report_file_path;
        if (!$path) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        $baseUrl = config('filesystems.disks.supabase.url');

        return $baseUrl ? rtrim($baseUrl, '/') . '/' . ltrim($path, '/') : null;
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Use raw query for enum modification
        if (config('database.default') === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE cash_advances MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'disbursed', 'signed', 'liquidated', 'overdue', 'settled', 'under-review') NOT NULL DEFAULT 'pending'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (config('database.default') === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE cash_advances MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'disbursed', 'liquidated', 'overdue', 'settled', 'under-review') NOT NULL DEFAULT 'pending'");
    }
};

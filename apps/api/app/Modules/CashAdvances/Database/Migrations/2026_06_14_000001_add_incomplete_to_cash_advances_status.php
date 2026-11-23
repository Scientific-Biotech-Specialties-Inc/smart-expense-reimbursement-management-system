<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adds 'incomplete' to the cash_advances.status enum to support
     * partial liquidation scenarios where total expense < amount issued.
     */
    public function up(): void
    {
        if (config('database.default') === 'sqlite') {
            // SQLite does not support enum constraints — string column already in place
            return;
        }

        DB::statement("ALTER TABLE cash_advances MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'disbursed', 'signed', 'liquidated', 'overdue', 'settled', 'under-review', 'incomplete') NOT NULL DEFAULT 'pending'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (config('database.default') === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE cash_advances MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'disbursed', 'signed', 'liquidated', 'overdue', 'settled', 'under-review') NOT NULL DEFAULT 'pending'");
    }
};

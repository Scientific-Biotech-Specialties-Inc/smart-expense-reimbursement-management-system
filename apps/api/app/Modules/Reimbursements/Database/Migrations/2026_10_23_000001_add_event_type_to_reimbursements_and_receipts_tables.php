<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            if (!Schema::hasColumn('reimbursements', 'event_type')) {
                $table->string('event_type', 100)->nullable()->after('expense_category_id');
            }
        });

        Schema::table('receipts', function (Blueprint $table) {
            if (!Schema::hasColumn('receipts', 'event_type')) {
                $table->string('event_type', 100)->nullable()->after('expense_category_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            if (Schema::hasColumn('reimbursements', 'event_type')) {
                $table->dropColumn('event_type');
            }
        });

        Schema::table('receipts', function (Blueprint $table) {
            if (Schema::hasColumn('receipts', 'event_type')) {
                $table->dropColumn('event_type');
            }
        });
    }
};

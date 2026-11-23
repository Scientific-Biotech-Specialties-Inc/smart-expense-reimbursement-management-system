<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            if (!Schema::hasColumn('receipts', 'discount_amount')) {
                $table->decimal('discount_amount', 12, 2)->default(0)->after('vat_amount');
            }
            if (!Schema::hasColumn('receipts', 'discount_type')) {
                $table->string('discount_type', 50)->nullable()->default('none')->after('discount_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            if (Schema::hasColumn('receipts', 'discount_type')) {
                $table->dropColumn('discount_type');
            }
            if (Schema::hasColumn('receipts', 'discount_amount')) {
                $table->dropColumn('discount_amount');
            }
        });
    }
};

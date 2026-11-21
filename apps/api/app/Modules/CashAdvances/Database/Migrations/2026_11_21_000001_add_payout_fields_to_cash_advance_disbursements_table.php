<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add unified payout metadata and granter signature columns to cash_advance_disbursements.
     */
    public function up(): void
    {
        Schema::table('cash_advance_disbursements', function (Blueprint $table) {
            if (!Schema::hasColumn('cash_advance_disbursements', 'granted_by')) {
                $table->string('granted_by')->nullable()->after('disbursed_by_id');
            }
            if (!Schema::hasColumn('cash_advance_disbursements', 'payout_method')) {
                $table->string('payout_method')->nullable()->after('channel');
            }
            if (!Schema::hasColumn('cash_advance_disbursements', 'payout_method_other')) {
                $table->string('payout_method_other')->nullable()->after('payout_method');
            }
            if (!Schema::hasColumn('cash_advance_disbursements', 'granter_signature')) {
                $table->longText('granter_signature')->nullable()->after('reference_number');
            }
        });
    }

    /**
     * Reverse the migration.
     */
    public function down(): void
    {
        $columns = array_values(array_filter(
            ['granted_by', 'payout_method', 'payout_method_other', 'granter_signature'],
            fn (string $column) => Schema::hasColumn('cash_advance_disbursements', $column)
        ));

        if (!empty($columns)) {
            Schema::table('cash_advance_disbursements', function (Blueprint $table) use ($columns) {
                $table->dropColumn($columns);
            });
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cash_advance_disbursements', function (Blueprint $table) {
            $table->unique('cash_advance_id', 'uniq_ca_disbursement_advance_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cash_advance_disbursements', function (Blueprint $table) {
            $table->dropUnique('uniq_ca_disbursement_advance_id');
        });
    }
};

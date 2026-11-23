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
        if (Schema::hasColumn('reimbursements', 'cutoff_period')) {
            Schema::table('reimbursements', function (Blueprint $table) {
                $table->dropColumn('cutoff_period');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasColumn('reimbursements', 'cutoff_period')) {
            Schema::table('reimbursements', function (Blueprint $table) {
                $table->string('cutoff_period')->nullable()->after('status');
            });
        }
    }
};

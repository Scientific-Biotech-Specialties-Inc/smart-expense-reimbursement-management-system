<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('reimbursements') && !Schema::hasColumn('reimbursements', 'prs_activity_id')) {
            Schema::table('reimbursements', function (Blueprint $table) {
                $table->unsignedBigInteger('prs_activity_id')->nullable()->index()->after('source_submission_id');
            });
        }

        if (Schema::hasTable('cash_advances')) {
            Schema::table('cash_advances', function (Blueprint $table) {
                if (!Schema::hasColumn('cash_advances', 'source_system')) {
                    $table->string('source_system', 32)->nullable()->index();
                }
                if (!Schema::hasColumn('cash_advances', 'itinerary_id')) {
                    $table->unsignedBigInteger('itinerary_id')->nullable()->index();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('reimbursements') && Schema::hasColumn('reimbursements', 'prs_activity_id')) {
            Schema::table('reimbursements', function (Blueprint $table) {
                $table->dropIndex(['prs_activity_id']);
                $table->dropColumn('prs_activity_id');
            });
        }

        if (Schema::hasTable('cash_advances')) {
            Schema::table('cash_advances', function (Blueprint $table) {
                if (Schema::hasColumn('cash_advances', 'itinerary_id')) {
                    $table->dropIndex(['itinerary_id']);
                    $table->dropColumn('itinerary_id');
                }
                if (Schema::hasColumn('cash_advances', 'source_system')) {
                    $table->dropIndex(['source_system']);
                    $table->dropColumn('source_system');
                }
            });
        }
    }
};

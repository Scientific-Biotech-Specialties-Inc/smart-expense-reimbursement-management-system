<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasUniqueSourceIdx = Schema::hasIndex('reimbursements', 'reimbursements_source_submission_unique');
        $hasNonUniqueSourceIdx = Schema::hasIndex('reimbursements', 'reimbursements_source_submission_idx');

        Schema::table('reimbursements', function (Blueprint $table) use ($hasUniqueSourceIdx, $hasNonUniqueSourceIdx) {
            if (!Schema::hasColumn('reimbursements', 'ticket_id')) {
                $table->unsignedBigInteger('ticket_id')->nullable()->after('contract_id')->index();
            }
            if (!Schema::hasColumn('reimbursements', 'ticket_number')) {
                $table->string('ticket_number', 64)->nullable()->after('ticket_id');
            }

            // Allow re-submitting a new TS claim for the same ticket_id after a terminal rejection.
            if ($hasUniqueSourceIdx) {
                $table->dropUnique('reimbursements_source_submission_unique');
            }
            if (!$hasNonUniqueSourceIdx) {
                $table->index(['source_system', 'source_submission_id'], 'reimbursements_source_submission_idx');
            }
        });
    }

    public function down(): void
    {
        $hasNonUniqueSourceIdx = Schema::hasIndex('reimbursements', 'reimbursements_source_submission_idx');

        Schema::table('reimbursements', function (Blueprint $table) use ($hasNonUniqueSourceIdx) {
            if ($hasNonUniqueSourceIdx) {
                $table->dropIndex('reimbursements_source_submission_idx');
            }
            if (Schema::hasColumn('reimbursements', 'ticket_number')) {
                $table->dropColumn('ticket_number');
            }
            if (Schema::hasColumn('reimbursements', 'ticket_id')) {
                $table->dropIndex(['ticket_id']);
                $table->dropColumn('ticket_id');
            }
        });
    }
};

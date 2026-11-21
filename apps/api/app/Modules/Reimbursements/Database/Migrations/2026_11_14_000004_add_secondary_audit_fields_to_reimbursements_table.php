<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            if (!Schema::hasColumn('reimbursements', 'secondary_audit_confirmed_at')) {
                $table->timestamp('secondary_audit_confirmed_at')->nullable()->after('approved_at');
            }
            if (!Schema::hasColumn('reimbursements', 'secondary_audit_by')) {
                $table->string('secondary_audit_by')->nullable()->after('secondary_audit_confirmed_at');
            }
            if (!Schema::hasColumn('reimbursements', 'secondary_audit_note')) {
                $table->text('secondary_audit_note')->nullable()->after('secondary_audit_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reimbursements', function (Blueprint $table) {
            foreach (['secondary_audit_note', 'secondary_audit_by', 'secondary_audit_confirmed_at'] as $col) {
                if (Schema::hasColumn('reimbursements', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};

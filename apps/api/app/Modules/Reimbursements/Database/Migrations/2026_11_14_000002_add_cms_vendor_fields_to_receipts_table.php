<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            if (!Schema::hasColumn('receipts', 'vendor_matched')) {
                $table->boolean('vendor_matched')->nullable()->after('admin_notes');
            }
            if (!Schema::hasColumn('receipts', 'vendor_accredited')) {
                $table->boolean('vendor_accredited')->nullable()->after('vendor_matched');
            }
            if (!Schema::hasColumn('receipts', 'vendor_audit_required')) {
                $table->boolean('vendor_audit_required')->default(false)->after('vendor_accredited');
            }
            if (!Schema::hasColumn('receipts', 'vendor_flagged')) {
                $table->boolean('vendor_flagged')->default(false)->after('vendor_audit_required');
            }
            if (!Schema::hasColumn('receipts', 'vendor_cms_supplier_id')) {
                $table->unsignedBigInteger('vendor_cms_supplier_id')->nullable()->after('vendor_flagged');
            }
            if (!Schema::hasColumn('receipts', 'vendor_status_tag')) {
                $table->string('vendor_status_tag')->nullable()->after('vendor_cms_supplier_id');
            }
            if (!Schema::hasColumn('receipts', 'vendor_suggested_at')) {
                $table->timestamp('vendor_suggested_at')->nullable()->after('vendor_status_tag');
            }
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $columns = [
                'vendor_suggested_at',
                'vendor_status_tag',
                'vendor_cms_supplier_id',
                'vendor_flagged',
                'vendor_audit_required',
                'vendor_accredited',
                'vendor_matched',
            ];
            foreach ($columns as $column) {
                if (Schema::hasColumn('receipts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_advances', function (Blueprint $table) {
            if (!Schema::hasColumn('cash_advances', 'contract_id')) {
                $table->unsignedBigInteger('contract_id')->nullable()->after('purpose')->index();
            }
            if (!Schema::hasColumn('cash_advances', 'client_name')) {
                $table->string('client_name')->nullable()->after('contract_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cash_advances', function (Blueprint $table) {
            if (Schema::hasColumn('cash_advances', 'client_name')) {
                $table->dropColumn('client_name');
            }
            if (Schema::hasColumn('cash_advances', 'contract_id')) {
                $table->dropIndex(['contract_id']);
                $table->dropColumn('contract_id');
            }
        });
    }
};

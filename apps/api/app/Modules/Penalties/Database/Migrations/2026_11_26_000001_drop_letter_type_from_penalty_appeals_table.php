<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('penalty_appeals', 'letter_type')) {
            Schema::table('penalty_appeals', function (Blueprint $table) {
                $table->dropColumn('letter_type');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('penalty_appeals', 'letter_type')) {
            Schema::table('penalty_appeals', function (Blueprint $table) {
                $table->string('letter_type', 20)->default('reason')->after('cycle_number');
            });
        }
    }
};

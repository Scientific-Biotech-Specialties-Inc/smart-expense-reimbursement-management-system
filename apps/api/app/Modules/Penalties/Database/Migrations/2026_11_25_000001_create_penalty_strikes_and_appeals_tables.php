<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('penalty_appeals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('cycle_number')->default(1);
            $table->string('letter_type', 20);
            $table->text('explanation');
            $table->string('letter_file_path');
            $table->string('letter_file_name');
            $table->string('letter_mime_type', 100)->nullable();
            $table->string('letter_file_hash', 64);
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reviewed_by_name')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('admin_comment')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'cycle_number', 'status'], 'penalty_appeals_user_cycle_status_idx');
        });

        Schema::create('penalty_strikes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('cycle_number')->default(1);
            $table->string('source_module', 30);
            $table->unsignedBigInteger('source_id');
            $table->string('source_reference', 80);
            $table->string('trigger_type', 40);
            $table->text('reason');
            $table->string('status', 20)->default('active');
            $table->foreignId('issued_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('issued_by_name')->default('System');
            $table->foreignId('appeal_id')->nullable()->constrained('penalty_appeals')->nullOnDelete();
            $table->foreignId('resolved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();

            $table->unique(
                ['user_id', 'cycle_number', 'source_module', 'source_id', 'trigger_type'],
                'penalty_strikes_unique_incident'
            );
            $table->index(['user_id', 'status'], 'penalty_strikes_user_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('penalty_strikes');
        Schema::dropIfExists('penalty_appeals');
    }
};

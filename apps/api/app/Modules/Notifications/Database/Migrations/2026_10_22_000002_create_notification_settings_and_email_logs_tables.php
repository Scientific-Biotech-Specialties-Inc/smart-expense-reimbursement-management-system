<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notification_settings')) {
            Schema::create('notification_settings', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->unique();
                $table->boolean('email_enabled')->default(true);

                // Employee toggles (G2-078)
                $table->boolean('request_submissions')->default(true);
                $table->boolean('status_updates')->default(true);
                $table->boolean('admin_comments')->default(true);
                $table->boolean('near_deadline_reminders')->default(true);
                $table->boolean('overdue_alerts')->default(true);

                // Admin toggles (G2-078)
                $table->boolean('admin_new_requests')->default(true);
                $table->boolean('admin_employee_updates')->default(true);
                $table->boolean('admin_overdue_liquidations')->default(true);

                $table->timestamps();
            });
        }

        if (!Schema::hasTable('email_logs')) {
            Schema::create('email_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('notification_id')->nullable()->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->string('recipient_email');
                $table->string('type', 100)->index();
                $table->string('setting_key', 100)->nullable()->index();
                $table->string('module', 60);
                $table->string('record_type', 60)->nullable();
                $table->unsignedBigInteger('record_id')->nullable();
                $table->string('record_link', 255)->nullable();
                $table->string('subject', 255);
                $table->string('status', 60)->index(); // queued, sent, failed, skipped by user setting
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'status']);
                $table->index(['record_type', 'record_id', 'type']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('notification_settings');
    }
};

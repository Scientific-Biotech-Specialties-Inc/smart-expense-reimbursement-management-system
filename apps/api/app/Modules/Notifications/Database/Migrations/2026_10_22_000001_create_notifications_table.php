<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('type', 100)->index();
                $table->string('module', 60)->index();
                $table->string('title');
                $table->text('message');
                $table->string('record_type', 60)->nullable()->index();
                $table->unsignedBigInteger('record_id')->nullable()->index();
                $table->string('record_link');
                $table->boolean('is_read')->default(false)->index();
                $table->timestamp('read_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'is_read', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};

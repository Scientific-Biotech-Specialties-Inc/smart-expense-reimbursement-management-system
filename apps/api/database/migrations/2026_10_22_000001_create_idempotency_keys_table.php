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
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('idempotency_key', 64)->index();
            $table->string('request_method', 10)->index();
            $table->string('request_path', 255);
            $table->string('request_hash', 64);
            $table->enum('status', ['pending', 'completed', 'failed'])->default('pending')->index();
            $table->integer('response_status')->nullable();
            $table->longText('response_body')->nullable();
            $table->json('response_headers')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key'], 'uniq_user_idempotency_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};

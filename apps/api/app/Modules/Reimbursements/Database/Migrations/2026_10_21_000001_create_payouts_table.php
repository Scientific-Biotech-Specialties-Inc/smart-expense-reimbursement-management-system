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
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reimbursement_id')->unique()->constrained('reimbursements')->cascadeOnDelete();
            $table->date('request_date')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->string('approved_by')->nullable();
            $table->string('granted_by')->nullable();
            $table->string('payout_method')->nullable();
            $table->string('payout_method_other')->nullable();
            $table->decimal('amount', 15, 2);
            $table->longText('granter_signature')->nullable();
            $table->longText('employee_signature')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payouts');
    }
};

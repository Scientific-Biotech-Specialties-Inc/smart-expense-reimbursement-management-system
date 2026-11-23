<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cms_contract_requests', function (Blueprint $table) {
            $table->id();
            $table->string('source_reference_id')->unique();
            $table->string('vendor_name');
            $table->string('tin_number')->nullable();
            $table->string('normalized_tin')->nullable()->index();
            $table->text('service_description');
            $table->string('category');
            $table->string('region')->nullable();
            $table->unsignedInteger('occurrence_count');
            $table->decimal('total_spend', 15, 2);
            $table->date('period_start');
            $table->date('period_end');
            $table->json('expense_items')->nullable();
            $table->string('contract_code')->nullable();
            $table->unsignedBigInteger('cms_request_id')->nullable();
            $table->text('supporting_expense_summary')->nullable();
            $table->string('status')->default('Pending');
            $table->foreignId('forwarded_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('forwarded_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cms_contract_requests');
    }
};

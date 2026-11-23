<?php

use App\Modules\Shared\Services\CurrencyConversionService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('currency_rates')) {
            Schema::create('currency_rates', function (Blueprint $table) {
                $table->id();
                $table->char('currency_code', 3)->unique();
                $table->decimal('rate_to_php', 16, 6);
                $table->date('effective_date');
                $table->string('source')->default('open.er-api.com');
                $table->timestamp('fetched_at')->nullable();
                $table->timestamps();
            });
        }

        $now = now();
        $today = $now->toDateString();
        $timestamp = $now->toDateTimeString();

        $seedRows = [];
        foreach (CurrencyConversionService::BASELINE_RATES as $code => $rateToPhp) {
            $seedRows[] = [
                'currency_code'  => $code,
                'rate_to_php'    => $rateToPhp,
                'effective_date' => $today,
                'source'         => 'baseline-seed',
                'fetched_at'     => $timestamp,
                'created_at'     => $timestamp,
                'updated_at'     => $timestamp,
            ];
        }

        DB::table('currency_rates')->insertOrIgnore($seedRows);

        Schema::table('receipts', function (Blueprint $table) {
            if (!Schema::hasColumn('receipts', 'exchange_rate')) {
                $table->decimal('exchange_rate', 16, 6)->default(1.000000)->after('currency');
            }
            if (!Schema::hasColumn('receipts', 'converted_php_amount')) {
                $table->decimal('converted_php_amount', 15, 2)->nullable()->after('exchange_rate');
            }
            if (!Schema::hasColumn('receipts', 'exchange_rate_date')) {
                $table->date('exchange_rate_date')->nullable()->after('converted_php_amount');
            }
            if (!Schema::hasColumn('receipts', 'exchange_rate_source')) {
                $table->string('exchange_rate_source')->nullable()->after('exchange_rate_date');
            }
        });

        DB::table('receipts')
            ->whereNull('converted_php_amount')
            ->update([
                'exchange_rate'        => 1.000000,
                'converted_php_amount' => DB::raw('total_amount'),
            ]);
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $columns = [
                'exchange_rate_source',
                'exchange_rate_date',
                'converted_php_amount',
                'exchange_rate',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('receipts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::dropIfExists('currency_rates');
    }
};

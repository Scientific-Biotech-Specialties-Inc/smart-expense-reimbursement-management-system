<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            \App\Modules\Reimbursements\Database\Seeders\ExpenseCategorySeeder::class,
            \App\Modules\CashAdvances\Database\Seeders\OverdueCashAdvanceSeeder::class,
            \App\Modules\CashAdvances\Database\Seeders\SignatureTestingSeeder::class,
        ]);
    }
}

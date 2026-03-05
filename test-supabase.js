/**
 * Quick test script to verify Supabase connection
 * Run: node test-supabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n');

  // Check environment variables
  console.log('1. Checking environment variables...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  console.log('   ✅ SUPABASE_URL:', supabaseUrl);
  console.log('   ✅ SUPABASE_SERVICE_KEY:', supabaseKey.substring(0, 20) + '...');
  console.log();

  // Create client
  console.log('2. Creating Supabase client...');
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('   ✅ Client created');
  console.log();

  // Test connection by querying tables
  console.log('3. Testing database connection...');
  
  try {
    // Check if trades table exists
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select('count')
      .limit(0);

    if (tradesError) {
      if (tradesError.message.includes('does not exist')) {
        console.error('   ❌ "trades" table does not exist');
        console.error('   📝 You need to run the SQL schema in Supabase');
        console.error('   👉 See SUPABASE_SETUP.md Step 2');
        console.log();
        console.log('   Tables to create:');
        console.log('      - trades');
        console.log('      - gaps');
        console.log('      - performance_metrics');
        process.exit(1);
      }
      throw tradesError;
    }

    console.log('   ✅ "trades" table exists');

    // Check gaps table
    const { error: gapsError } = await supabase
      .from('gaps')
      .select('count')
      .limit(0);

    if (gapsError) {
      console.warn('   ⚠️  "gaps" table missing (optional)');
    } else {
      console.log('   ✅ "gaps" table exists');
    }

    // Check performance_metrics table
    const { error: metricsError } = await supabase
      .from('performance_metrics')
      .select('count')
      .limit(0);

    if (metricsError) {
      console.warn('   ⚠️  "performance_metrics" table missing (optional)');
    } else {
      console.log('   ✅ "performance_metrics" table exists');
    }

    console.log();

    // Get trade count
    console.log('4. Checking existing data...');
    const { count, error: countError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    console.log(`   📊 Trades in database: ${count || 0}`);
    console.log();

    // Try to insert a test record (then delete it)
    console.log('5. Testing write permissions...');
    const testTrade = {
      trade_id: 'TEST_' + Date.now(),
      entry_timestamp: new Date().toISOString(),
      exit_timestamp: new Date().toISOString(),
      entry_gap_usd: 100,
      exit_gap_usd: 20,
      cheap_exchange: 'test',
      expensive_exchange: 'test',
      position_size_btc: 0.001,
      realized_pnl_btc: 0.0001,
      realized_pnl_usd: 5,
      hold_duration_seconds: 300,
      entry_price_cheap: 50000,
      entry_price_expensive: 50100,
      exit_price_long: 50080,
      exit_price_short: 50020,
      fees_entry: 1,
      fees_exit: 1,
      fees_total: 2,
    };

    const { data: insertData, error: insertError } = await supabase
      .from('trades')
      .insert([testTrade])
      .select();

    if (insertError) {
      console.error('   ❌ Failed to insert test record:', insertError.message);
      process.exit(1);
    }

    console.log('   ✅ Write test successful');

    // Delete test record
    const { error: deleteError } = await supabase
      .from('trades')
      .delete()
      .eq('trade_id', testTrade.trade_id);

    if (deleteError) {
      console.warn('   ⚠️  Failed to delete test record (not critical)');
    } else {
      console.log('   ✅ Cleanup successful');
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log();
    console.log('Your bot is ready to log trades to Supabase! 🚀');
    console.log();
    console.log('Next steps:');
    console.log('  1. Run your bot: npm run dev');
    console.log('  2. Make some trades');
    console.log('  3. Check your Supabase dashboard to see the data');
    console.log();

  } catch (error) {
    console.error();
    console.error('❌ CONNECTION TEST FAILED');
    console.error('Error:', error.message);
    console.error();
    console.error('Troubleshooting:');
    console.error('  1. Check your .env file has correct credentials');
    console.error('  2. Verify your Supabase project is active');
    console.error('  3. Make sure you ran the SQL schema (see SUPABASE_SETUP.md)');
    console.error();
    process.exit(1);
  }
}

testSupabaseConnection();

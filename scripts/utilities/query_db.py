
import duckdb

DB_FILE = 'data/unified_markets.db'

def query_market_counts():
    try:
        con = duckdb.connect(database=DB_FILE, read_only=True)
        result = con.execute("SELECT platform, COUNT(*) FROM normalized_markets GROUP BY platform").fetchall()
        con.close()

        print("--- Internal Database Market Counts ---")
        for row in result:
            print(f"{row[0]}: {row[1]}")
        print("-------------------------------------")

    except Exception as e:
        print(f"Error querying DuckDB: {e}")

if __name__ == "__main__":
    query_market_counts()

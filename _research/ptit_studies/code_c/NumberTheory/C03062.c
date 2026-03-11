/*
 * Filename: C03062.c
 * Description: Calculates Greatest Common Divisor using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

typedef long long ll;

ll GCD(ll a, ll b)
{
    while (b != 0)
    {
        ll x = a % b;
        a = b;
        b = x;
    }
    return a;
}

// Function to solve specific test case
void solve()
{
    int n, m;
    scanf("%d %d", &n, &m); // Read input
    ll res = 1;
    for (int i = n; i <= m; i++)
    {
        ll uoc = GCD(res, i);
        res = res * i / uoc;
    }
    printf("%lld\n", res); // Print result
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
        solve();
    return 0;
}
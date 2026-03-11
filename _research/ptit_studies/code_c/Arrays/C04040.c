/*
 * Filename: C04040.c
 * Description: Calculates sums using functions: max, solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

long long max(long long a, long long b)
{
    if (a > b)
        return a;
    return b;
}

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    long long a[n];
    long long sum = 0, Maxx = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%lld", &a[i]); // Read input
        sum += a[i];
        if (sum < 0)
            sum = 0;
        Maxx = max(Maxx, sum);
    }
    printf("%lld\n", Maxx); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}
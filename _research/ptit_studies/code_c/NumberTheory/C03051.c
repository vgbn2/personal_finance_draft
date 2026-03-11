/*
 * Filename: C03051.c
 * Description: Checks for prime numbers using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>
#include <stdbool.h>

typedef long long ll;

bool prime(int n)
{
    if (n < 2)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

// Function to solve specific test case
void solve()
{
    ll l, r;
    scanf("%lld %lld", &l, &r); // Read input
    l = ceil(sqrt(l));
    r = floor(sqrt(r));
    int d = 0;
    for (int i = l; i <= r; i++)
        if (prime(i))
            d++;
    printf("%d\n", d); // Print result
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

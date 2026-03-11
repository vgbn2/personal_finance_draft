/*
 * Filename: C03053.c
 * Description: C Program using functions: solve
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

bool check(int n)
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
    int n;
    scanf("%d", &n); // Read input
    for (int i = 2; i <= n / 2; i++)
        if (check(i))
        {
            if (check(n - i))
                printf("%d %d ", i, n - i); // Print result
        }
    printf("\n"); // Print result
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
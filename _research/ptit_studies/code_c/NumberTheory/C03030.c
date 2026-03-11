/*
 * Filename: C03030.c
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
    int d = n % 10;
    n /= 10;
    while (n > 0)
    {
        if (n % 10 > d)
            return 0;
        d = n % 10;
        n /= 10;
    }
    return 1;
}

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int l = pow(10, n - 1);
    int r = pow(10, n) - 1;
    for (int i = l; i <= r; i++)
        if (check(i))
            printf("%d ", i); // Print result
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
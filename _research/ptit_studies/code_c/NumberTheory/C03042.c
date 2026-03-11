/*
 * Filename: C03042.c
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
#include <stdbool.h>

bool check(int n)
{
    int d = n % 10;
    n /= 10;
    while (n > 0)
    {
        if (n % 10 <= d)
            return 0;
        d = n % 10;
        n /= 10;
    }
    return 1;
}

// Function to solve specific test case
void solve()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    int d = 0;
    for (int i = a; i <= b; i++)
        if (check(i))
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
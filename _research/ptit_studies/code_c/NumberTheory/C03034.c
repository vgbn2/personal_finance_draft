/*
 * Filename: C03034.c
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

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int d = 0;
    for (int i = 1; i <= sqrt(n); i++)
        if (n % i == 0)
        {
            if (i % 2 == 0)
                d++;
            if (n / i % 2 == 0)
                d++;
            if (i % 2 == 0 && i * i == n)
                d--;
        }
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
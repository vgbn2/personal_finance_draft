/*
 * Filename: C03033.c
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
    printf("%d = ", n); // Print result
    for (int i = 2; i <= sqrt(n); i++)
    {
        if (n % i == 0)
        {
            int d = 0;
            while (n % i == 0)
            {
                d++;
                n /= i;
            }
            printf("%d^%d", i, d); // Print result
            if (n != 1)
                printf(" * "); // Print result
        }
    }
    if (n != 1)
        printf("%d^1", n); // Print result
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
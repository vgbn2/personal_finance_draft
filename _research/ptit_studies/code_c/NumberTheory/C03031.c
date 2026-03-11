/*
 * Filename: C03031.c
 * Description: C Program using functions: ucln, solve
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

int ucln(int a, int b)
{
    while (b > 0)
    {
        int x = a % b;
        a = b;
        b = x;
    }
    return a;
}

// Function to solve specific test case
void solve()
{
    int a, b, c, d;
    scanf("%d %d %d %d", &a, &b, &c, &d); // Read input
    if (ucln(a, b) == ucln(c, d))
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
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
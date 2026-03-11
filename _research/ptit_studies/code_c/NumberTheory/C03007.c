/*
 * Filename: C03007.c
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

bool snt(int n)
{
    if (n < 2)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

bool thuannghich(int n)
{
    int N = n;
    int res = 0;
    while (n > 0)
    {
        res = res * 10 + n % 10;
        n /= 10;
    }
    if (res == N)
        return 1;
    return 0;
}

// Function to solve specific test case
void solve()
{
    int a, b;
    scanf("%d%d", &a, &b); // Read input
    int dem = 0;
    for (int i = a; i <= b; i++)
    {
        if (snt(i) && thuannghich(i))
        {
            dem++;
            printf("%d ", i); // Print result
            if (dem % 10 == 0)
                printf("\n"); // Print result
        }
    }
    printf("\n"); // Print result
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
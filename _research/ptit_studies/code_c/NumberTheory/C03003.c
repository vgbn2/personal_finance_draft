/*
 * Filename: C03003.c
 * Description: C Program
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
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 2;; i++)
    {
        if (snt(i))
        {
            printf("%d\n", i); // Print result
            n--;
            if (n == 0)
                break;
        }
    }
    return 0;
}
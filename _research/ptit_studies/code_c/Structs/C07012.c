/*
 * Filename: C07012.c
 * Description: Sorts an array of elements using functions: init, sort, display
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

struct Product
{
    int id;
    char name[100], type[100];
    double buyPrice, sellPrice, profit;
};

void init(struct Product sp[], int i)
{
    fflush(stdin);
    sp[i].id = i + 1;
    scanf("\n%[^\n]s", sp[i].name); // Read input
    scanf("\n%[^\n]s", sp[i].type); // Read input
    scanf("%lf %lf", &sp[i].buyPrice, &sp[i].sellPrice); // Read input
    sp[i].profit = sp[i].sellPrice - sp[i].buyPrice;
}

void sort(struct Product sp[], int n)
{
    for (int i = 0; i < n - 1; i++)
        for (int j = i + 1; j < n; j++)
            if (sp[j].profit > sp[i].profit)
            {
                struct Product temp = sp[i];
                sp[i] = sp[j];
                sp[j] = temp;
            }
}

void display(struct Product sp[], int n)
{
    for (int i = 0; i < n; i++)
        printf("%d %s %s %g\n", sp[i].id, sp[i].name, sp[i].type, sp[i].profit); // Print result
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    struct Product sp[n];
    for (int i = 0; i < n; i++)
        init(sp, i);
    sort(sp, n);
    display(sp, n);
    return 0;
}